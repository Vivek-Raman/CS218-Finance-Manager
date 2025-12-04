# Quick Setup: Environment Variables

## 🚀 Quick Start

1. **Create terraform.tfvars:**
   ```bash
   cd infra
   cp terraform.tfvars.example terraform.tfvars
   ```

2. **Add your OpenAI API key:**
   ```bash
   # Edit terraform.tfvars
   nano terraform.tfvars
   # Set: openai_api_key = "sk-your-key-here"
   ```

3. **Deploy:**
   ```bash
   cd ..
   make tofu-apply
   ```

That's it! The OpenAI key will be automatically passed to the Lambda function.

## 📝 File Structure

```
infra/
├── terraform.tfvars.example  # Template (safe to commit)
├── terraform.tfvars          # Your actual values (gitignored)
└── variables.tf              # Variable definitions
```

## 🔒 Security

- ✅ `terraform.tfvars` is in `.gitignore` - never committed
- ✅ `terraform.tfvars.example` is a template - safe to commit
- ✅ Sensitive variables marked as `sensitive = true` in Terraform

## 📋 What Gets Set

When you set `openai_api_key` in `terraform.tfvars`, it:
1. Gets passed to Terraform/OpenTofu
2. Sets as environment variable in `categorize_expenses` Lambda
3. Used by `expenseCategorizer.js` service

## 🔄 Updating the Key

Just edit `terraform.tfvars` and redeploy:
```bash
# Edit the file
nano infra/terraform.tfvars

# Redeploy (updates Lambda environment variables)
make tofu-apply
```

No need to rebuild Lambda packages - environment variables update automatically.
