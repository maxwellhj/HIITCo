# Put the demo online with Cloudflare Pages

The app is a static website. A Pages Direct Upload project needs no GitHub connection, API keys, build settings or server. This demo contains fictional data and an openly accessible staff demonstration.

1. Sign in at https://dash.cloudflare.com/ (create an account if needed).
2. Open **Workers & Pages**, choose **Create application**, and choose the **Pages / upload assets** option. Cloudflare may also show **Get started** under a Pages section, then **Drag and drop your files**.
3. Create a Direct Upload project named `hiit-co-demo` (choose another name if unavailable).
4. Upload the prepared `hiit-co-demo.zip`. It must contain `index.html` at the top level, rather than a parent `dist` folder. If the interface asks for a folder instead, unzip it and upload the contents.
5. Click **Deploy site**. When Cloudflare reports success, open the HTTPS `pages.dev` address it provides.
6. On your phone, check Home, Progress and Staff. In Staff, change Sarah's target, save it and return to Home. Changes are local to that browser; they do not sync across devices.
7. On iPhone use Safari → Share → Add to Home Screen. On Android use the browser's Install app / Add to Home screen option.

The exact menu labels can change. Choose a **Pages static upload**, rather than creating a Worker or connecting a repository. No custom domain or paid subscription is necessary to use the provided `pages.dev` address. Check any plan choice before accepting a paid option.

## Updating the demo

Run `npm ci`, `npm test`, then `npm run build` from the project root. Upload the **contents** of `dist` as a new deployment in the same Pages project. Do not upload the source checkout, `.git` or `node_modules`. Keep `_headers`, `sw.js`, `registerSW.js`, manifest and icon files alongside the assets. The headers ask search engines not to index this demo, and allow browsers to recheck service-worker files. They do not restrict access: anyone with the URL can use the fictional demo. The current service worker may apply an updated version after the app's existing tabs have been closed and reopened.

If an upload fails, check that `index.html` is at the ZIP root and that you selected Pages. No live site or Cloudflare project has been created by generating this ZIP. After deployment, share the public URL in chat for a live check.
