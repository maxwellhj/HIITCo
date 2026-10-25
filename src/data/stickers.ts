/** Add the club's actual sticker artwork here when it is supplied. Awards come from the later staff backend. */
export interface ClubSticker {
  id: string;
  name: string;
  description: string;
  image: string;
}
export const clubStickers: readonly ClubSticker[] = [];
