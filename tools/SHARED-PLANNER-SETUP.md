# Set up one shared HIIT Co. calendar and task list

The Command Centre page is ready to connect. Shared storage must be created once in your Cloudflare account. This creates a NEW Worker and database; keep your existing Hub and Workout Builder Workers.

## 1. Create the shared database
1. Sign in at https://dash.cloudflare.com/.
2. Open **Storage & databases → D1 SQL Database** and create a database named **hiit-co-planner**.
3. Open that database's **Console**.
4. Copy all the SQL from [shared-planner.sql](./shared-planner.sql), paste it into the console, and run it. This creates the empty shared calendar and task list.

## 2. Create the planner Worker
1. Open **Workers & Pages** and create a new **Hello World Worker**, named **hiit-co-planner** (or another available name).
2. Open **Edit code**. Replace only this NEW Worker's starter code with [shared-planner-worker.js](./shared-planner-worker.js).
3. Save/deploy the Worker.

## 3. Connect its database
1. In the new Worker's **Bindings**, add a **D1 database** binding.
2. Set the variable/binding name to **DB** (capital letters).
3. Select the **hiit-co-planner** database.
4. Save/deploy the change.

## 4. Set the team access code
1. In the Worker's **Settings → Variables and Secrets**, add a **Secret**.
2. Name it **TEAM_KEY** (capital letters).
3. Choose a strong random access code of at least 16 characters. Store it in your password manager.
4. Save/deploy the change. Share this code privately only with authorised staff.
5. Do not put the code in GitHub, the website source, a URL, or this chat.

The same team code is used on each laptop. This is shared team access, not separate individual staff accounts. Rotate TEAM_KEY in Cloudflare if access needs to be revoked.

## 5. Connect the home laptop
1. Open https://maxwellhj.github.io/HIITCo/.
2. Above the calendar, choose **Connect shared planner**.
3. Enter the new Worker's address, such as **https://hiit-co-planner.your-account.workers.dev**.
4. Enter the team access code and choose **Connect**.
5. The existing local planner is backed up before the shared planner is shown.
6. Choose **Import this browser’s earlier items** to add its old events and tasks to the shared version.
7. Wait for **Shared changes saved**.

## 6. Connect the work laptop
Repeat step 5 in the actual browser where you entered the work laptop's tasks. Import that browser's earlier items too. Review any similarly named events and remove real duplicates after confirming they are the same item.

Changes will be checked every 15 seconds while each page is open. Returning to a tab also checks for changes. The Worker address and code are held for the tab session; closing the browser may require reconnecting.

## If two people edit at the same time
A conflicting save is stopped. It does not silently overwrite someone else's changes. Your edits stay on that laptop. Choose **Download backup**, then **Reload shared**, review the team's latest version, and reapply your change. You can use **Retry sync** after a network interruption.

## Reminders
Calendar/task content is shared. Reminder acknowledgements are per laptop, so dismissing a reminder at home does not dismiss it at work. Reminder pop-ups still require the page to be open.

## Verification
Add a test event at home and wait for **Shared changes saved**. On the work laptop, verify that it appears within 15 seconds. Add a linked task at work, then confirm it appears at home. Remove the test items after checking.

Cloudflare references: [D1 setup](https://developers.cloudflare.com/d1/get-started/) and [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
