# GitHub Secrets Setup Guide

This guide will help you configure the required GitHub secrets for the CI/CD pipeline.

## Required Secrets

The CI/CD pipeline requires 4 secrets to be configured in your GitHub repository:

| Secret Name | Purpose | Required For |
|------------|---------|--------------|
| `SLACK_WEBHOOK_URL` | Send build notifications to Slack | Notifications |
| `SSH_HOST` | Production server hostname/IP | Deployment |
| `SSH_USER` | SSH username for deployment | Deployment |
| `SSH_PRIVATE_KEY` | SSH private key for authentication | Deployment |

## Step-by-Step Setup

### 1. Access GitHub Secrets Settings

1. Go to your GitHub repository
2. Click **Settings** (top menu)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**

### 2. Configure Slack Webhook

#### Your Slack Webhook URL

```
https://hooks.slack.com/services/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
```

#### Steps:

1. Click **New repository secret**
2. Name: `SLACK_WEBHOOK_URL`
3. Value: Paste the webhook URL above
4. Click **Add secret**

#### Test Slack Integration:

After adding the secret, push a commit to trigger the pipeline. You should receive a notification in your Slack channel.

### 3. Configure SSH Deployment (Optional)

If you want to enable automatic deployment to your production server, configure these secrets:

#### 3a. SSH_HOST

1. Click **New repository secret**
2. Name: `SSH_HOST`
3. Value: Your server's IP address or hostname
   - Example: `203.0.113.42`
   - Example: `server.example.com`
4. Click **Add secret**

#### 3b. SSH_USER

1. Click **New repository secret**
2. Name: `SSH_USER`
3. Value: Your SSH username
   - Example: `ubuntu`
   - Example: `deploy`
4. Click **Add secret**

#### 3c. SSH_PRIVATE_KEY

**Important:** This is the most sensitive secret. Keep it secure!

1. On your local machine, generate an SSH key pair:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github-actions
   ```

2. Add the public key to your server:
   ```bash
   ssh-copy-id -i ~/.ssh/github-actions.pub user@your-server
   ```

3. Copy the private key content:
   ```bash
   cat ~/.ssh/github-actions
   ```

4. In GitHub:
   - Click **New repository secret**
   - Name: `SSH_PRIVATE_KEY`
   - Value: Paste the entire private key content (including `-----BEGIN` and `-----END` lines)
   - Click **Add secret**

## Verification

### Check Secrets Are Configured

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. You should see all configured secrets listed
3. You cannot view secret values, only names

### Test the Pipeline

1. Make a small change to your code
2. Commit and push:
   ```bash
   git add .
   git commit -m "test: verify CI/CD pipeline"
   git push origin main
   ```

3. Go to **Actions** tab in GitHub
4. Watch the pipeline run
5. Check Slack for notification

## Troubleshooting

### Slack Notifications Not Working

**Problem:** No notifications in Slack after pipeline runs

**Solutions:**
1. Verify webhook URL is correct (no extra spaces)
2. Check webhook is enabled in Slack workspace
3. Ensure secret name is exactly `SLACK_WEBHOOK_URL`
4. Check workflow logs for error messages

### Deployment Fails

**Problem:** Deploy stage fails with SSH errors

**Solutions:**
1. Verify SSH_HOST is reachable: `ping your-server`
2. Test SSH connection manually: `ssh -i ~/.ssh/github-actions user@server`
3. Ensure private key has correct format (includes header/footer)
4. Check server has repository cloned in correct location
5. Verify Docker is installed on server

### Secret Not Found Error

**Problem:** Workflow fails with "secret not found"

**Solutions:**
1. Check secret name matches exactly (case-sensitive)
2. Ensure secret is added to repository (not organization)
3. Re-add the secret if needed
4. Check workflow file references correct secret name

## Security Best Practices

### Protecting Your Secrets

1. **Never commit secrets to Git**
   - Use `.gitignore` for sensitive files
   - Use environment variables

2. **Rotate secrets regularly**
   - Change SSH keys every 90 days
   - Regenerate Slack webhooks if compromised

3. **Use minimal permissions**
   - SSH user should have limited permissions
   - Only grant access to necessary directories

4. **Monitor secret usage**
   - Check GitHub Actions logs regularly
   - Review Slack notifications for unusual activity

### If Secrets Are Compromised

1. **Immediately revoke the secret:**
   - Slack: Regenerate webhook in Slack settings
   - SSH: Remove public key from server's `~/.ssh/authorized_keys`

2. **Generate new credentials:**
   - Create new webhook/SSH key
   - Update GitHub secrets

3. **Review recent activity:**
   - Check GitHub Actions logs
   - Review server access logs
   - Check for unauthorized deployments

## Optional: Disable Deployment

If you don't want automatic deployment, you can:

### Option 1: Skip Deployment Stage

The deployment stage only runs on `main` branch pushes (not pull requests). To disable it:

1. Don't configure SSH secrets
2. The deploy job will be skipped automatically

### Option 2: Remove Deployment Stage

Edit `.github/workflows/ci.yml` and remove the `deploy` job section.

## Testing Without Deployment

You can test the pipeline without deployment by:

1. Creating a pull request instead of pushing to `main`
2. The pipeline will run all stages except deployment
3. Slack notifications will be skipped for PRs

## Summary

### Minimum Required Setup

For basic CI/CD (without deployment):
- ✅ `SLACK_WEBHOOK_URL` - For notifications

### Full Setup

For complete CI/CD with deployment:
- ✅ `SLACK_WEBHOOK_URL` - For notifications
- ✅ `SSH_HOST` - Server address
- ✅ `SSH_USER` - SSH username
- ✅ `SSH_PRIVATE_KEY` - SSH private key

## Next Steps

After configuring secrets:

1. ✅ Push a commit to trigger the pipeline
2. ✅ Verify all stages pass in GitHub Actions
3. ✅ Check Slack for success notification
4. ✅ If deployment enabled, verify service is running on server

## Support

If you encounter issues:
1. Check the [CI-CD-SETUP.md](./CI-CD-SETUP.md) for detailed documentation
2. Review GitHub Actions logs for error messages
3. Test SSH connection manually before configuring secrets
4. Verify Slack webhook works with curl:
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test notification"}' \
     YOUR_WEBHOOK_URL
   ```

---

**Your Slack Webhook URL (for reference):**
```
https://hooks.slack.com/services/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
```

**Remember:** Keep this URL secure and never commit it to Git!
