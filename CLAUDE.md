# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lab00 is a Salesforce application for managing invoices (Fatture), medical visits (Visite), and donations (Donazioni) for Fondazione Lab00. The system integrates with Google Apps Script for external data synchronization.

**Connected Salesforce Org (DEV):** `smaccagno@lab00.dev` (FondazioneLab00Dev)
- Instance: https://fondazionelab00ets--dev.sandbox.my.salesforce.com
- Already set as target-org

**PROD Org:** `smaccagno@lab00.org` (PROD)

## Critical Deployment Rules

**ALWAYS follow these rules from `.cursor/rules/salesforce-deploy.mdc`:**

### Before ANY code/metadata changes:
1. Check git status and verify alignment with GitHub
2. Fetch remote changes
3. Verify local branch is aligned with remote tracking branch
4. If misaligned, show differences and realign (pull --rebase or agreed strategy)

```bash
git status -sb
git fetch --all --prune
git branch -vv
git log --oneline --decorate --graph --left-right HEAD...@{u}
```

### Every DEV deploy MUST sync GitHub:
1. Verify local ↔ GitHub alignment
2. Deploy to DEV
3. Post-deploy verification
4. Update remote GitHub branch (if local changes) so GitHub reflects deployed state

**Deployment commands:**

Deploy specific files:
```bash
sf project deploy start -d force-app/main/default/classes/<ClassName>.cls -d force-app/main/default/lwc/<ComponentName> --target-org smaccagno@lab00.dev --wait 15
```

Deploy all:
```bash
sf project deploy start -d force-app/main/default --target-org smaccagno@lab00.dev --wait 15
```

Deploy with auto-sync (preferred):
```bash
npm run deploy:dev:sync
```

If deploy fails due to async jobs:
```bash
sf apex run --file /dev/stdin --target-org smaccagno@lab00.dev <<'APEX'
for (AsyncApexJob j : [SELECT Id FROM AsyncApexJob WHERE Status IN ('Queued','Preparing','Processing','Holding')]) {
  System.abortJob(j.Id);
}
APEX
```

### PROD deployments (ONLY when explicitly requested):
- MUST use dedicated branch (default: `prod`)
- Checkout prod branch → sync with remote → verify differences → deploy → update remote prod branch
- Never deploy to PROD from non-dedicated branches

## Build, Test & Lint Commands

```bash
# Lint JavaScript (Aura/LWC)
npm run lint

# Run all unit tests
npm run test
# or specifically
npm run test:unit

# Watch mode for tests
npm run test:unit:watch

# Debug tests
npm run test:unit:debug

# Test coverage
npm run test:unit:coverage

# Format code (Prettier)
npm run prettier

# Verify formatting
npm run prettier:verify

# Git sync (commit + push)
npm run git:sync "Custom commit message"
./scripts/git-sync.sh "Custom commit message"

# Deploy to DEV only
npm run deploy:dev
```

## Project Architecture

### Core Domain Objects

**Nonprofit Data Model:**
- `GiftEntry` (Donazioni) - Main donation records
- `GiftTransaction` (Transazioni) - Financial transactions linked to donations
- `GiftTransactionDesignation` (Distribuzioni) - Allocation of donations to programs
- `GiftDesignation` (Programmi/Campaigns) - Programs receiving donations
- `Invoice__c` (Fatture) - Invoices with medical visit tracking
- `Anno_Reportistica__c` - Reporting year records for budget tracking
- `Donor_Overview__c` - Aggregated donor statistics per year
- `Overview_Budget_per_Anno__c` - Budget summaries per year per program

**Shadow Objects (Sync with Google Sheets):**
- `Fattura_Shadow__c` - Invoice shadow records
- `Distribuzione_Shadow__c` - Distribution shadow records
- `Pagamento_Shadow__c` - Payment shadow records
- `Transazione_Shadow__c` - Transaction shadow records

### Key LWC Components

- `donationTableEditor` - Multi-row donation creation table with integrated donor selection
- `invoiceExcelEditor` - Excel-like editor for invoice cell editing
- `giftAllocation` - Budget allocation interface
- `distribuzioni` - Distribution management
- `offers` - Offer management interface
- `configurazioniTypePicker` - Configuration type picker

### Important Apex Classes

**Controllers & Services:**
- `DonationCreationController` - Handles donation creation from LWC, calls subflows
- `FlowController` - Flow utilities including picklist JSON generation
- `InvoiceCreationController` - Invoice creation logic
- `InvoiceExcelEditorController` - Excel editor backend
- `GiftAllocationController` - Gift allocation logic
- `BudgetSummaryController` - Budget summary calculations

**Invocable Actions:**
- `AllineaBudgetAnnoAction` - Align budget year data
- `AllineaDonatoreAnnoAction` - Align donor year data
- `AllineaProgrammaAction` - Align program data (triggers continuation queueable)
- `CreateWithholdAllocationAction` - Create withholding allocations
- `EnsureReportingYearInvocable` - Ensure reporting year exists

**Batch & Queueable:**
- `AllineaProgrammaContinuationQueueable` - Program alignment with continuation
- `CreateAllocationsQueueable` - Async allocation creation
- `CreateDistribuzioneShadowQueueable` - Distribution shadow sync
- `FatturaShadowBatchProcessor` - Invoice shadow batch processing
- `InvoiceStaticValuesBatch` - Invoice static values updates

**Utilities:**
- `FlowUtils` - Flow utilities
- `InvoiceUtil` - Invoice utilities
- `InvoiceService` - Invoice business logic

### Flows (128 total)

Key flows:
- `Create_New_Donation` - Donation creation flow using donationTableEditor LWC
- `Assegna_Donatore_Anno` - Subflow for donor year assignment (called by DonationCreationController)
- Various invoice, budget, and program alignment flows

### Google Apps Script Integration

`google-apps-script.gs` (121KB) - OAuth-based integration for syncing data between Salesforce and Google Sheets. Uses centralized token management system deployed as "Utente che accede" web app.

Configuration in `configuration-PROD.gs`.

## Development Workflow

1. **Before starting:** Check alignment with GitHub (see Critical Deployment Rules)
2. **Make changes:** Edit Apex classes, LWC, flows, or other metadata
3. **Test locally:** Run unit tests with `npm run test`
4. **Lint/Format:** Use `npm run prettier` to format code
5. **Deploy to DEV:** Use `npm run deploy:dev:sync` (deploys + commits + pushes to GitHub)
6. **Verify:** Test in DEV sandbox
7. **Pre-commit hooks:** Husky runs prettier and eslint automatically on staged files

## Key Patterns

### Donation Creation Flow
- User enters multiple donations in `donationTableEditor` LWC
- Component validates and passes JSON to `DonationCreationController.createDonations()`
- Apex creates GiftEntry + GiftTransaction records
- Apex calls `Assegna_Donatore_Anno` subflow for each donation
- Flow continues based on single vs. multiple donations

### Invoice Management
- Invoices track medical visits and associated costs
- Excel-like interface via `invoiceExcelEditor` LWC
- Validation happens client-side and server-side
- Shadow objects sync with Google Sheets

### Budget & Reporting
- Annual reporting years (`Anno_Reportistica__c`) track budgets
- Programs aligned via queueable chain (continuation pattern)
- Budget summaries aggregated in `Overview_Budget_per_Anno__c`
- Donor summaries in `Donor_Overview__c`

## Testing Strategy

- LWC tests use `@salesforce/sfdx-lwc-jest`
- Apex test classes follow `*Test.cls` naming convention
- Test coverage required for deployments
- Pre-commit hook runs related tests automatically

## Important Notes

- **Never skip pre-commit hooks** - they ensure code quality and prevent deployment issues
- **Always verify three-way alignment:** GitHub ↔ local ↔ DEV
- **Google Apps Script changes** require separate deployment to Google Apps Script project
- **Async job conflicts** during deploy can be resolved by aborting queued jobs (see commands above)
- **API Version:** 65.0 (check sfdx-project.json)
