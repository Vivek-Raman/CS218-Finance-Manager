terraform {
  backend "s3" {
    bucket         = "finance-manager-terraform-state-975201825314"
    key            = "terraform.tfstate"
    region         = "us-west-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

