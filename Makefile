.PHONY: dev dev-env load-env tofu-outputs help
.PHONY: deploy deploy-infra deploy-plan deploy-destroy
.PHONY: build-frontend build-backend
.PHONY: tofu-init tofu-plan tofu-apply tofu-destroy tofu-validate tofu-fmt

# Default target
help:
	@echo "Development targets:"
	@echo "  dev         - Run frontend dev server with OpenTofu outputs loaded"
	@echo "  dev-env     - Show current environment variables from OpenTofu"
	@echo "  load-env    - Load OpenTofu outputs (use: eval \$$(make load-env))"
	@echo "  tofu-outputs - Show all OpenTofu outputs"
	@echo ""
	@echo "Build targets:"
	@echo "  build-frontend - Build frontend for production"
	@echo "  build-backend  - Build backend Lambda packages"
	@echo ""
	@echo "Infrastructure targets:"
	@echo "  tofu-init    - Initialize OpenTofu backend"
	@echo "  tofu-plan    - Show OpenTofu execution plan"
	@echo "  tofu-apply   - Apply OpenTofu infrastructure changes"
	@echo "  tofu-destroy - Destroy OpenTofu infrastructure"
	@echo "  tofu-validate - Validate OpenTofu configuration"
	@echo "  tofu-fmt     - Format OpenTofu files"
	@echo ""
	@echo "Deployment targets:"
	@echo "  deploy       - Full deployment (plan + apply)"
	@echo "  deploy-plan  - Show deployment plan without applying"
	@echo "  deploy-infra - Deploy infrastructure only"
	@echo "  deploy-destroy - Destroy all infrastructure"

# Load OpenTofu outputs - outputs shell export commands
# Usage: eval $$(make load-env)
load-env:
	@cd infra && \
	API_URL=$$(tofu output -raw env_api_gateway_url 2>/dev/null); \
	TABLE_NAME=$$(tofu output -raw env_dynamodb_table_name 2>/dev/null); \
	if [ -n "$$API_URL" ]; then \
	  echo "export API_GATEWAY_URL=$$API_URL"; \
	  echo "export VITE_API_URL=$$API_URL"; \
	fi; \
	if [ -n "$$TABLE_NAME" ]; then \
	  echo "export DYNAMODB_TABLE_NAME=$$TABLE_NAME"; \
	fi

# Show environment outputs
dev-env:
	@echo "OpenTofu Environment Outputs:"
	@cd infra && \
	API_URL=$$(tofu output -raw env_api_gateway_url 2>/dev/null); \
	TABLE_NAME=$$(tofu output -raw env_dynamodb_table_name 2>/dev/null); \
	[ -n "$$API_URL" ] && echo "  env_api_gateway_url: $$API_URL" || echo "  env_api_gateway_url: (not set)"; \
	[ -n "$$TABLE_NAME" ] && echo "  env_dynamodb_table_name: $$TABLE_NAME" || echo "  env_dynamodb_table_name: (not set)"

# Show all OpenTofu outputs
tofu-outputs:
	@cd infra && tofu output

# Run dev server with OpenTofu outputs loaded
dev:
	@echo "Loading OpenTofu outputs..."
	@cd infra && \
	API_URL=$$(tofu output -raw env_api_gateway_url 2>/dev/null || echo ""); \
	TABLE_NAME=$$(tofu output -raw env_dynamodb_table_name 2>/dev/null || echo ""); \
	if [ -z "$$API_URL" ]; then \
	  echo "⚠️  Warning: env_api_gateway_url not found. Run 'tofu apply' in infra/ first."; \
	fi; \
	cd ../fm-frontend && \
	VITE_API_URL="$$API_URL" \
	DYNAMODB_TABLE_NAME="$$TABLE_NAME" \
	npm run dev -- --clearScreen false

# Build targets
build-frontend:
	@echo "Building frontend..."
	@cd fm-frontend && npm run build
	@echo "✓ Frontend build complete"

build-backend:
	@echo "Building backend Lambda packages..."
	@cd infra && tofu init -upgrade
	@echo "✓ Backend packages will be built during tofu apply"

# OpenTofu infrastructure targets
tofu-init:
	@echo "Initializing OpenTofu..."
	@cd infra && tofu init
	@echo "✓ OpenTofu initialized"

tofu-validate:
	@echo "Validating OpenTofu configuration..."
	@cd infra && tofu validate
	@echo "✓ Configuration validated"

tofu-fmt:
	@echo "Formatting OpenTofu files..."
	@cd infra && tofu fmt -recursive
	@echo "✓ Files formatted"

tofu-plan:
	@echo "Creating OpenTofu execution plan..."
	@cd infra && tofu plan
	@echo "✓ Plan complete"

tofu-apply:
	@echo "Applying OpenTofu infrastructure..."
	@cd infra && tofu apply
	@echo "✓ Infrastructure deployed"

tofu-destroy:
	@echo "⚠️  WARNING: This will destroy all infrastructure!"
	@echo "OpenTofu will prompt for confirmation..."
	@cd infra && tofu destroy
	@echo "✓ Infrastructure destroyed"

# Deployment targets
deploy-plan: tofu-validate tofu-plan
	@echo "✓ Deployment plan ready. Run 'make deploy-infra' to apply."

deploy-infra: tofu-validate tofu-apply
	@echo "✓ Infrastructure deployed successfully"
	@echo "Run 'make tofu-outputs' to see deployment outputs"

deploy: deploy-infra
	@echo "✓ Full deployment complete"

deploy-destroy: tofu-destroy
	@echo "✓ Infrastructure destroyed"

