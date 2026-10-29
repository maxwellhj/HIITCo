import { useEffect, useState } from "react";
export function ConnectAvatar({
  name,
  photo,
}: {
  name: string;
  photo?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);
  return (
    <span className="avatar" aria-hidden="true">
      {photo && !failed ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        (Array.from(name.trim())[0]?.toUpperCase() ?? "?")
      )}
    </span>
  );
}
