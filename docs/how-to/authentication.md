# Authentication

Resolving authentication issues, token management, and credential validation workflows.

## SSO Login Troubleshooting

### Problem: SSO Login Fails with Browser Issues

Your SSO login process starts but fails during browser authentication or token exchange.

**Diagnosis Steps:**

1. **Check Browser Accessibility:**

```bash
# Test with verbose logging to see exact failure point
aws-ts auth:login --profile your-profile --verbose

# Check if browser opens automatically
# Look for messages about browser launch
```

1. **Common Browser Issues:**

**No default browser configured:**

```bash
# Set default browser (Linux/macOS)
export BROWSER=/usr/bin/firefox

# Retry authentication
aws-ts auth:login --profile your-profile
```

**Browser security restrictions:**

- Disable popup blockers for your SSO domain
- Allow redirects to `localhost` and `127.0.0.1`
- Clear browser cache for SSO domain

1. **Manual Token Retrieval:**

If automatic browser flow fails:

```bash
# Use AWS CLI directly for manual flow
aws sso login --profile your-profile

# Verify tokens are cached
aws-ts auth:status --profile your-profile
```

### Problem: SSO Login Succeeds but Credentials Invalid

Authentication completes but subsequent AWS operations fail with credential errors.

**Diagnosis:**

1. **Check Token Status:**

```bash
# Verify token existence and expiry
aws-ts auth:status --profile your-profile --detailed

# Check token cache directly
ls -la ~/.aws/sso/cache/
```

1. **Validate Credential Chain:**

```bash
# Test credential resolution with verbose logging
aws-ts auth:status --profile your-profile --verbose

# Look for credential provider chain messages
```

1. **Common Resolution Issues:**

**Role permissions insufficient:**

- Verify the SSO role has required permissions
- Check account-level restrictions
- Confirm role trust relationships

**Token corruption:**

```bash
# Clear token cache and re-authenticate
rm -rf ~/.aws/sso/cache/*
aws-ts auth:login --profile your-profile
```

**Clock skew issues:**

```bash
# Synchronize system clock
sudo ntpdate -s time.nist.gov  # Linux
sudo sntp -sS time.apple.com   # macOS

# Retry authentication
aws-ts auth:login --profile your-profile
```

## Token Expiry Management

### Problem: Handling Expired SSO Tokens

You receive warnings about expired tokens or authentication fails due to token expiry.

**Proactive Token Management:**

1. **Monitor Token Status:**

```bash
# Check all profiles for expiry warnings
aws-ts auth:status --all-profiles --detailed

# Look for expiry warnings in output
```

1. **Automated Token Refresh:**

```bash
#!/bin/bash
# token-refresh.sh - Automated token refresh script

# Get list of SSO profiles with expired tokens
EXPIRED_PROFILES=$(aws-ts auth:status --all-profiles \
  --format json | jq -r '.profiles[] | select(.type == "sso" and \
  .credentialsValid == false) | .name')

# Refresh each expired profile
for profile in $EXPIRED_PROFILES; do
  echo "Refreshing profile: $profile"
  aws-ts auth:login --profile "$profile"
done
```

1. **Token Expiry Notifications:**

The CLI provides automatic warnings:

```text
⚠ Tokens expiring soon: dev-profile, staging-profile
Consider refreshing these tokens soon

⚠ Expired tokens: prod-profile
Run 'aws-ts auth login --profile <profile>' to refresh expired tokens
```

## Multi-Profile Authentication

### Problem: Managing Authentication Across Multiple Profiles

You work with multiple AWS accounts and need to maintain authentication state
across different profiles efficiently.

**Workflow Solutions:**

1. **Batch Authentication:**

```bash
# Authenticate multiple profiles sequentially
PROFILES=("dev-app1" "dev-app2" "staging-app" "prod-readonly")

for profile in "${PROFILES[@]}"; do
  echo "Authenticating profile: $profile"
  aws-ts auth:login --profile "$profile"
done

# Verify all authentications
aws-ts auth:status --all-profiles
```

1. **Selective Profile Management:**

```bash
# Login only to active development profiles
aws-ts auth:login --profile dev-primary
aws-ts auth:login --profile dev-secondary

# Keep production profiles logged out for security
aws-ts auth:logout --profile prod-profile
```

1. **Session Persistence Strategy:**

```bash
# Check which profiles need authentication
aws-ts auth:profiles | grep "✗" | cut -d"'" -f2

# Authenticate only invalid profiles
for profile in $(aws-ts auth:profiles --format json | \
  jq -r '.[] | select(.credentialsValid == false) | .name'); do
  aws-ts auth:login --profile "$profile"
done
```

## Credential Cache Management

### Problem: Corrupted or Inconsistent Credential Cache

Your credential cache becomes corrupted, leading to inconsistent authentication state.

**Cache Cleanup Procedures:**

1. **Identify Cache Issues:**

```bash
# Check for cache inconsistencies
aws-ts auth:status --all-profiles --verbose

# Look for cache-related error messages
aws-ts auth:profiles --verbose 2>&1 | grep -i cache
```

1. **Selective Cache Clearing:**

```bash
# Clear specific profile credentials
# (CLI doesn't expose direct cache clearing, use AWS CLI)
aws sso logout --profile problematic-profile

# Verify cache cleared
aws-ts auth:status --profile problematic-profile
```

1. **Complete Cache Reset:**

```bash
# Clear all SSO token cache
rm -rf ~/.aws/sso/cache/*

# Clear all CLI credential cache
rm -rf ~/.aws/cli/cache/*

# Re-authenticate required profiles
aws-ts auth:login --profile your-primary-profile
```

## Profile Switching Workflows

### Problem: Efficiently Switching Between Authenticated Profiles

You need to switch between different AWS profiles during development workflows.

**Switching Strategies:**

1. **Interactive Profile Selection:**

```bash
# List available authenticated profiles
aws-ts auth:profiles | grep "✓.*✓"

# Switch to specific profile
export AWS_PROFILE=dev-profile

# Verify switch successful
aws-ts auth:status
```

1. **Environment-Based Switching:**

```bash
#!/bin/bash
# profile-switcher.sh

case "$1" in
  "dev")
    export AWS_PROFILE=dev-profile
    ;;
  "staging")
    export AWS_PROFILE=staging-profile
    ;;
  "prod")
    export AWS_PROFILE=prod-readonly
    ;;
  *)
    echo "Usage: $0 {dev|staging|prod}"
    exit 1
    ;;
esac

echo "Switched to profile: $AWS_PROFILE"
aws-ts auth:status
```

1. **Profile Validation After Switch:**

```bash
# Function to safely switch profiles
switch_profile() {
  local profile=$1

  # Verify profile exists
  if ! aws-ts auth:status --profile "$profile" &>/dev/null; then
    echo "Error: Profile '$profile' not found"
    return 1
  fi

  # Check if authenticated
  if ! aws-ts auth:status --profile "$profile" | grep -q "✓.*✓"; then
    echo "Profile '$profile' not authenticated. Logging in..."
    aws-ts auth:login --profile "$profile"
  fi

  export AWS_PROFILE="$profile"
  echo "Successfully switched to profile: $profile"
}
```

## Network and Connectivity Issues

### Problem: Authentication Fails Due to Network Issues

SSO authentication fails due to corporate firewalls, proxies, or network
connectivity issues.

**Network Troubleshooting:**

1. **Proxy Configuration:**

```bash
# Configure proxy for AWS CLI
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1

# Test authentication with proxy
aws-ts auth:login --profile your-profile --verbose
```

1. **Firewall Considerations:**

Ensure these domains are accessible:

- Your SSO start URL domain
- `*.amazonaws.com`
- `localhost:*` (for callback URLs)

1. **Certificate Issues:**

```bash
# Disable SSL verification (temporary debugging only)
export AWS_CA_BUNDLE=""
export REQUESTS_CA_BUNDLE=""

# Test authentication
aws-ts auth:login --profile your-profile

# Re-enable SSL verification after testing
unset AWS_CA_BUNDLE REQUESTS_CA_BUNDLE
```

## Error Recovery Patterns

### Problem: Systematic Recovery from Authentication Failures

You need reliable patterns for recovering from various authentication failure scenarios.

**Recovery Workflow:**

1. **Diagnostic Information Gathering:**

```bash
# Comprehensive diagnostic check
echo "=== System Information ==="
aws --version
node --version
echo "AWS_PROFILE: ${AWS_PROFILE:-not set}"

echo "=== Profile Status ==="
aws-ts auth:status --all-profiles --verbose

echo "=== Cache Status ==="
ls -la ~/.aws/sso/cache/ 2>/dev/null || echo "No SSO cache"
```

1. **Progressive Recovery Steps:**

```bash
#!/bin/bash
# auth-recovery.sh

recovery_steps() {
  local profile=$1

  echo "Step 1: Check profile configuration"
  if ! aws-ts auth:status --profile "$profile" --verbose; then
    echo "Profile configuration invalid"
    return 1
  fi

  echo "Step 2: Clear cached tokens"
  aws sso logout --profile "$profile" 2>/dev/null || true

  echo "Step 3: Fresh authentication"
  if ! aws-ts auth:login --profile "$profile"; then
    echo "Authentication failed"
    return 1
  fi

  echo "Step 4: Validate credentials"
  if ! aws-ts auth:status --profile "$profile" | grep -q "✓.*✓"; then
    echo "Credential validation failed"
    return 1
  fi

  echo "Recovery successful for profile: $profile"
}
```

**Architecture Benefits:** This systematic approach leverages the CLI's
**graceful error handling** and **comprehensive logging** to provide clear
failure points and recovery paths.

## Advanced Authentication Scenarios

### Cross-Account Role Assumption

For complex multi-account scenarios:

```bash
# Authenticate to base account
aws-ts auth:login --profile base-account

# Use assumed role profile
export AWS_PROFILE=cross-account-role

# Verify role assumption works
aws-ts auth:status --profile cross-account-role
```

### CI/CD Authentication Patterns

For automated environments:

```bash
# Non-interactive authentication check
if ! aws-ts auth:status --profile ci-profile | grep -q "✓.*✓"; then
  echo "Authentication required but running in non-interactive mode"
  exit 1
fi

# Proceed with authenticated operations
echo "Proceeding with authenticated AWS operations"
```
