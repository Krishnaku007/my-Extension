# Pull request creation guide

This repository may be delivered in an environment without a configured Git remote. If GitHub does not show a **Create pull request** button, use this checklist.

## 1. Confirm you are on a feature branch

```bash
git branch --show-current
```

If the command prints `main` or `master`, create a feature branch before pushing:

```bash
git switch -c smart-download-link-verifier
```

## 2. Confirm a GitHub remote exists

```bash
git remote -v
```

If no remote is listed, add your GitHub repository URL:

```bash
git remote add origin git@github.com:<your-org-or-user>/<your-repo>.git
```

HTTPS also works:

```bash
git remote add origin https://github.com/<your-org-or-user>/<your-repo>.git
```

## 3. Push the branch

```bash
git push -u origin HEAD
```

After the push completes, GitHub usually prints a pull request URL. If it does not, open the repository in GitHub and select **Compare & pull request**.

## 4. Create the PR with GitHub CLI

If you have GitHub CLI installed and authenticated, you can create the PR directly:

```bash
gh pr create --fill --base main --head "$(git branch --show-current)"
```

If your repository uses `master` instead of `main`, replace `--base main` with `--base master`.

## 5. Common failure fixes

### `fatal: 'origin' does not appear to be a git repository`

No remote is configured. Run `git remote add origin ...` with your GitHub repository URL, then push again.

### `Permission denied (publickey)`

Your SSH key is not authorized for the GitHub repository. Either add the key to GitHub or switch the remote to HTTPS:

```bash
git remote set-url origin https://github.com/<your-org-or-user>/<your-repo>.git
```

### `remote: Repository not found`

The repository URL is wrong or your GitHub account does not have access. Confirm the organization/user name, repository name, and account permissions.

### `gh: command not found`

GitHub CLI is not installed. Use the GitHub website after pushing the branch, or install GitHub CLI from <https://cli.github.com/>.

## Suggested PR title

```text
Add Smart Download Link Verifier Chrome extension (Manifest V3)
```

## Suggested PR summary

```markdown
### Summary
- Add a Manifest V3 Chrome extension that scans software download pages and download links.
- Add vendor-domain verification, trust scoring, typosquatting checks, and optional reputation API integrations.
- Add a dark glassmorphism popup dashboard, content-script highlighting, and deployment/security documentation.

### Testing
- node --check background/service-worker.js
- node --check popup/popup.js
- node --check content/content.js
- node --check utils/trust-score.js
- node --check utils/domain-checker.js
- node --check utils/detector.js
- JSON validation for manifest and software database
```
