import { apiJson } from "../gymmaster/auth";
import { MAX_VIDEO_BYTES } from "./skillVideos";
const CHUNK = 1024 * 1024;
interface State {
  storage: {
    sql: {
      exec<T = Record<string, unknown>>(
        query: string,
        ...args: unknown[]
      ): { one(): T; toArray(): T[] };
    };
    deleteAll(): Promise<void>;
    setAlarm(time: number): Promise<void>;
  };
}
/** Private per-video SQLite object. Bounded chunks keep uploads/playback out of Worker memory. */
export class SkillVideoStore {
  constructor(private state: State) {
    this.tables();
  }
  private tables() {
    this.state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS chunks (idx INTEGER PRIMARY KEY,data BLOB NOT NULL)",
    );
    this.state.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS info (id INTEGER PRIMARY KEY CHECK(id=1),size INTEGER NOT NULL,mime TEXT NOT NULL,complete INTEGER NOT NULL)",
    );
  }
  async alarm() {
    const rows = this.state.storage.sql
      .exec<{ complete: number }>("SELECT complete FROM info WHERE id=1")
      .toArray();
    if (!rows[0]?.complete) {
      await this.state.storage.deleteAll();
      this.tables();
    }
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname,
      sql = this.state.storage.sql;
    if (path === "/delete" && request.method === "POST") {
      await this.state.storage.deleteAll();
      this.tables();
      return apiJson({ saved: true });
    }
    if (path === "/upload" && request.method === "POST") {
      if (sql.exec("SELECT id FROM info").toArray().length)
        return apiJson({ error: "exists" }, 409);
      const size = Number(request.headers.get("X-Video-Size")),
        mime = request.headers.get("Content-Type");
      if (
        !Number.isSafeInteger(size) ||
        size < 16 ||
        size > MAX_VIDEO_BYTES ||
        !["video/mp4", "video/webm"].includes(mime ?? "") ||
        !request.body
      )
        return apiJson({ error: "invalid_video" }, 400);
      sql.exec(
        "INSERT INTO info(id,size,mime,complete) VALUES(1,?,?,0)",
        size,
        mime,
      );
      await this.state.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
      const reader = request.body.getReader();
      let received = 0,
        used = 0,
        idx = 0,
        buffer = new Uint8Array(CHUNK);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > size) throw Error();
          for (let offset = 0; offset < value.byteLength;) {
            const n = Math.min(CHUNK - used, value.byteLength - offset);
            buffer.set(value.subarray(offset, offset + n), used);
            used += n;
            offset += n;
            if (used === CHUNK) {
              sql.exec(
                "INSERT INTO chunks(idx,data) VALUES(?,?)",
                idx++,
                buffer,
              );
              buffer = new Uint8Array(CHUNK);
              used = 0;
            }
          }
        }
        if (received !== size) throw Error();
        if (used)
          sql.exec(
            "INSERT INTO chunks(idx,data) VALUES(?,?)",
            idx,
            buffer.slice(0, used),
          );
        const head = new Uint8Array(
          sql
            .exec<{ data: ArrayBuffer }>("SELECT data FROM chunks WHERE idx=0")
            .one().data,
        );
        const valid =
          mime === "video/mp4"
            ? String.fromCharCode(...head.slice(4, 8)) === "ftyp"
            : [26, 69, 223, 163].every((b, i) => head[i] === b);
        if (!valid) throw Error();
        sql.exec("UPDATE info SET complete=1 WHERE id=1");
        return apiJson({ saved: true });
      } catch {
        await reader.cancel().catch(() => {});
        await this.state.storage.deleteAll();
        this.tables();
        return apiJson({ error: "invalid_video" }, 400);
      }
    }
    if (path !== "/video" || !["GET", "HEAD"].includes(request.method))
      return apiJson({ error: "not_found" }, 404);
    const info = sql
      .exec<{ size: number; mime: string; complete: number }>(
        "SELECT size,mime,complete FROM info WHERE id=1",
      )
      .toArray()[0];
    if (!info?.complete) return apiJson({ error: "not_found" }, 404);
    let start = 0,
      end = info.size - 1;
    const range = request.headers.get("Range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${info.size}`,
            "Cache-Control": "no-store",
          },
        });
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= info.size ||
        (!match[1] && Number(match[2]) === 0)
      )
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${info.size}`,
            "Cache-Control": "no-store",
          },
        });
    }
    const headers: Record<string, string> = {
      "Content-Type": info.mime,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    let pos = start;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        try {
          const row = sql
              .exec<{ data: ArrayBuffer }>(
                "SELECT data FROM chunks WHERE idx=?",
                Math.floor(pos / CHUNK),
              )
              .one(),
            bytes = new Uint8Array(row.data),
            offset = pos % CHUNK,
            n = Math.min(bytes.length - offset, end - pos + 1);
          if (n <= 0) throw Error();
          controller.enqueue(bytes.slice(offset, offset + n));
          pos += n;
          if (pos > end) controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(request.method === "HEAD" ? null : body, {
      status: range ? 206 : 200,
      headers,
    });
  }
}
