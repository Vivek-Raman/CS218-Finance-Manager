# Finance Manager

## Make Commands

### Development

```bash
make dev              # Run frontend dev server with OpenTofu outputs loaded
```

### Infrastructure

```bash
make tofu-init        # Initialize OpenTofu backend
make tofu-plan        # Show OpenTofu execution plan
make tofu-apply       # Apply OpenTofu infrastructure changes
make tofu-destroy     # Destroy OpenTofu infrastructure
```

### Deployment

```bash
make deploy           # Full deployment (plan + apply)
make deploy-plan      # Show deployment plan without applying
make deploy-infra     # Deploy infrastructure only
make deploy-destroy   # Destroy all infrastructure
```

### Build

```bash
make build-frontend   # Build frontend for production
make build-backend    # Build backend Lambda packages
```

### Help

```bash
make help             # Show all available commands
```

