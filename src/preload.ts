/** Resolves once every image is loaded and decoded (or failed, or after a timeout), so a page can appear fully ready. */
export function preloadImages(urls: (string | null | undefined)[], timeoutMs = 5000): Promise<void> {
  const loads = urls.filter((u): u is string => !!u).map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.src = url;
        if (img.decode) img.decode().then(() => resolve(), () => resolve());
        else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }
      })
  );
  let timer: number;
  const timeout = new Promise<void>((resolve) => { timer = window.setTimeout(resolve, timeoutMs); });
  return Promise.race([Promise.all(loads).then(() => undefined), timeout]).finally(() => clearTimeout(timer));
}
