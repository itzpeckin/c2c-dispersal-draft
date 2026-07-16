C2C DISPERSAL DRAFT — BROWSER-ONLY LAUNCH STEPS

PART 1 — FIRESTORE SECURITY RULES
1. Open https://console.firebase.google.com
2. Click the C2C Dispersal Draft project.
3. In the left menu, open Firestore Database.
4. Click the Rules tab.
5. Open the included file named firestore.rules.
6. Select all of the existing Firebase rules and delete them.
7. Copy everything from firestore.rules and paste it into Firebase.
8. Click Publish.

PART 2 — UPLOAD THE WEBSITE TO GITHUB
1. Open your c2c-dispersal-draft repository on github.com.
2. Click Add file.
3. Click Upload files.
4. Extract the ZIP from ChatGPT first.
5. Open the extracted c2c-dispersal-draft-production folder.
6. Drag ALL files and the data folder into the GitHub upload box.
7. Confirm index.html is at the top level, not inside another folder.
8. At the bottom, select Commit directly to the main branch.
9. Click Commit changes.

PART 3 — ENABLE GITHUB PAGES
1. In the repository, click Settings.
2. In the left menu, click Pages.
3. Under Build and deployment, choose Deploy from a branch.
4. Choose main as the branch.
5. Choose /(root) as the folder.
6. Click Save.
7. Wait for GitHub to display the website address.

PART 4 — ADD THE GITHUB DOMAIN TO FIREBASE AUTHENTICATION
1. Copy only the domain from the GitHub Pages address. Example: itzpeckin.github.io
2. Return to Firebase.
3. Open Authentication.
4. Open Settings.
5. Find Authorized domains.
6. Click Add domain.
7. Paste the GitHub Pages domain without https:// and without the repository path.
8. Save.

PART 5 — CREATE THE COMMISSIONER ACCOUNT
1. Open the GitHub Pages website.
2. Click Create Account.
3. Enter your name, email, and a password with at least six characters.
4. Submit the form.
5. The website will say the account is waiting for approval.

PART 6 — MAKE THAT ACCOUNT THE COMMISSIONER
1. Return to Firebase.
2. Open Authentication, then Users.
3. Find your email and copy its User UID.
4. Open Firestore Database, then the Data tab.
5. Open the users collection.
6. Open the document whose name matches your User UID.
7. Change approved from false to true.
8. Change role from member to commissioner.
9. Change teamName from null to Peckin.
10. Save each change.
11. Return to the website and refresh.

PART 7 — INITIALIZE THE DRAFT
1. Sign in as commissioner.
2. The website will offer an Initialize Draft button.
3. Click it once.
4. This creates all 72 fixed snake-draft picks.

PART 8 — HAVE MEMBERS REGISTER
1. Send the website address to all 12 league members.
2. Each member clicks Create Account.
3. Each member uses their own email and chooses their own password.
4. They will see Waiting for commissioner approval.
5. Tell them to send you the email they used.

PART 9 — ASSIGN MEMBER ACCOUNTS
1. Sign in as commissioner.
2. Open Draft Center.
3. Click Manage Member Accounts.
4. Find each person's email.
5. Select the correct draft team name.
6. The member refreshes the website and receives access.

PART 10 — TEST BEFORE DRAFT DAY
1. Open the site in two different browsers or devices.
2. Sign in as two different members.
3. Verify both see the same board.
4. Make one test pick.
5. Verify both screens update.
6. Send, view, decline, and accept a test trade.
7. Add and remove a player from a queue.
8. Test Pause, Undo, Edit, and Force Pick as commissioner.
9. Use Reset Entire Draft after testing.

IMPORTANT
- Keep the Firebase project on the free Spark plan.
- Do not post or save any member passwords.
- The Firebase configuration in firebase-config.js is safe to publish; the Firestore rules control access.
- The NFL fantasy-point values are currently blank pending the separate scoring-calculation step.
