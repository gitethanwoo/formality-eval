import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEED_DIR = join(import.meta.dirname, "..", "tasks", "file-sorting", "seed");

// All 80 seed filenames with their placeholder content
const FILES: Array<{ name: string; content: string }> = [
  // ── Photos (16 files) ─────────────────────────────────────────────
  { name: "IMG_20240315_vacation_beach.jpg", content: "placeholder image" },
  { name: "IMG_20240316_vacation_sunset.jpg", content: "placeholder image" },
  { name: "IMG_20240401_family_dinner.jpg", content: "placeholder image" },
  { name: "IMG_20240520_office_setup.jpg", content: "placeholder image" },
  { name: "IMG_20231225_christmas_tree.jpg", content: "placeholder image" },
  { name: "IMG_20231014_hiking_trail.jpg", content: "placeholder image" },
  { name: "screenshot_2024-06-12.png", content: "placeholder image" },
  { name: "screenshot_2024-07-03_bug_report.png", content: "placeholder image" },
  { name: "screenshot_2024-01-22_dashboard.png", content: "placeholder image" },
  { name: "profile_photo_linkedin.jpg", content: "placeholder image" },
  { name: "product_mockup_v2.png", content: "placeholder image" },
  { name: "team_photo_offsite_2024.jpg", content: "placeholder image" },
  { name: "whiteboard_brainstorm_session.jpg", content: "placeholder image" },
  { name: "IMG_20230918_concert.jpg", content: "placeholder image" },
  { name: "logo_draft_final.png", content: "placeholder image" },
  { name: "banner_ad_1200x628.png", content: "placeholder image" },

  // ── Documents (16 files) ───────────────────────────────────────────
  { name: "meeting_notes_project_alpha_jan2024.txt", content: "Meeting notes for Project Alpha kickoff, January 2024." },
  { name: "meeting_notes_project_alpha_feb2024.txt", content: "Meeting notes for Project Alpha sprint review, February 2024." },
  { name: "meeting_notes_project_beta_mar2024.txt", content: "Meeting notes for Project Beta planning, March 2024." },
  { name: "project_alpha_proposal.pdf", content: "placeholder pdf - Project Alpha proposal document" },
  { name: "project_alpha_final_report.pdf", content: "placeholder pdf - Project Alpha final report" },
  { name: "project_beta_requirements.docx", content: "placeholder docx - Project Beta requirements specification" },
  { name: "project_beta_timeline.pdf", content: "placeholder pdf - Project Beta timeline and milestones" },
  { name: "old_resume_2023.pdf", content: "placeholder pdf - Resume from 2023" },
  { name: "cover_letter_techcorp.pdf", content: "placeholder pdf - Cover letter for TechCorp application" },
  { name: "nda_signed_clientx.pdf", content: "placeholder pdf - Signed NDA with Client X" },
  { name: "onboarding_checklist.docx", content: "placeholder docx - New employee onboarding checklist" },
  { name: "product_roadmap_2024.pdf", content: "placeholder pdf - Product roadmap for 2024" },
  { name: "user_research_findings.txt", content: "User research findings from Q1 2024 interviews." },
  { name: "api_documentation_draft.txt", content: "Draft API documentation for the v2 REST endpoints." },
  { name: "style_guide_v3.pdf", content: "placeholder pdf - Company style guide version 3" },
  { name: "quarterly_okrs_q2_2024.docx", content: "placeholder docx - Q2 2024 OKRs" },

  // ── Spreadsheets (12 files) ────────────────────────────────────────
  { name: "Q1_2024_revenue_report.xlsx", content: "placeholder spreadsheet" },
  { name: "Q2_2024_revenue_report.xlsx", content: "placeholder spreadsheet" },
  { name: "Q3_2024_revenue_report.xlsx", content: "placeholder spreadsheet" },
  { name: "Q4_2023_revenue_report.xlsx", content: "placeholder spreadsheet" },
  { name: "budget_2024_final_FINAL_v3.xlsx", content: "placeholder spreadsheet" },
  { name: "employee_directory.csv", content: "name,email,department\nJohn Doe,john@example.com,Engineering" },
  { name: "sales_leads_june2024.csv", content: "company,contact,status\nAcme Inc,jane@acme.com,qualified" },
  { name: "expense_report_q1_2024.xlsx", content: "placeholder spreadsheet" },
  { name: "inventory_tracker.xlsx", content: "placeholder spreadsheet" },
  { name: "project_alpha_burndown.csv", content: "sprint,planned,completed\n1,20,18\n2,22,22" },
  { name: "customer_feedback_2024.xlsx", content: "placeholder spreadsheet" },
  { name: "marketing_spend_by_channel.xlsx", content: "placeholder spreadsheet" },

  // ── Code files (20 files) ──────────────────────────────────────────
  { name: "api_handler.ts", content: 'export function handleRequest(req: Request): Response {\n  return new Response("OK");\n}' },
  { name: "utils.ts", content: "export function formatDate(d: Date): string {\n  return d.toISOString();\n}" },
  { name: "database.ts", content: "export class Database {\n  connect() { /* placeholder */ }\n}" },
  { name: "auth_middleware.ts", content: "export function authenticate(req: any) {\n  // placeholder auth\n}" },
  { name: "index.js", content: 'const express = require("express");\nconst app = express();\napp.listen(3000);' },
  { name: "webpack.config.js", content: "module.exports = {\n  entry: './src/index.js',\n  output: { filename: 'bundle.js' }\n};" },
  { name: "data_pipeline.py", content: "import pandas as pd\n\ndef process(df):\n    return df.dropna()" },
  { name: "train_model.py", content: "import torch\n\ndef train(model, data):\n    pass  # placeholder" },
  { name: "scraper.py", content: "import requests\nfrom bs4 import BeautifulSoup\n\ndef scrape(url):\n    pass" },
  { name: "test_utils.py", content: "import unittest\n\nclass TestUtils(unittest.TestCase):\n    def test_placeholder(self):\n        self.assertTrue(True)" },
  { name: "migrate_db.ts", content: "export async function migrate() {\n  // run migrations\n}" },
  { name: "setup_script.sh", content: "#!/bin/bash\necho 'Setting up environment...'\nnpm install" },
  { name: "deploy.sh", content: "#!/bin/bash\necho 'Deploying to production...'\ndocker compose up -d" },
  { name: "validate_schema.ts", content: "import { z } from 'zod';\nexport const UserSchema = z.object({ name: z.string() });" },
  { name: "react_dashboard.tsx", content: "export default function Dashboard() {\n  return <div>Dashboard</div>;\n}" },
  { name: "hooks_useAuth.ts", content: "export function useAuth() {\n  return { user: null, login: () => {} };\n}" },
  { name: "components_Button.tsx", content: "export function Button({ label }: { label: string }) {\n  return <button>{label}</button>;\n}" },
  { name: "graphql_schema.ts", content: "export const typeDefs = `\n  type Query {\n    hello: String\n  }\n`;" },
  { name: "cron_cleanup.py", content: "import os\nimport glob\n\ndef cleanup_old_logs():\n    pass" },
  { name: "lambda_handler.js", content: "exports.handler = async (event) => {\n  return { statusCode: 200, body: 'OK' };\n};" },

  // ── Misc files (16 files) ──────────────────────────────────────────
  { name: "docker-compose.yml", content: "version: '3.8'\nservices:\n  app:\n    build: .\n    ports:\n      - '3000:3000'" },
  { name: ".env.example", content: "DATABASE_URL=postgres://localhost:5432/mydb\nAPI_KEY=your-key-here" },
  { name: "nginx.conf", content: "server {\n  listen 80;\n  server_name localhost;\n  location / { proxy_pass http://app:3000; }\n}" },
  { name: "Makefile", content: "build:\n\tdocker build -t myapp .\n\ntest:\n\tnpm test" },
  { name: "backup_2024-03-01.zip", content: "placeholder archive" },
  { name: "backup_2024-06-15.zip", content: "placeholder archive" },
  { name: "legacy_code_archive.zip", content: "placeholder archive" },
  { name: "server_access.log", content: "2024-06-01 12:00:00 GET /api/health 200\n2024-06-01 12:01:00 POST /api/login 200" },
  { name: "error_log_2024-05.log", content: "2024-05-15 ERROR: Connection timeout\n2024-05-16 ERROR: Null pointer" },
  { name: "application_debug.log", content: "DEBUG: Starting application\nDEBUG: Loading config\nDEBUG: Ready" },
  { name: "TODO.txt", content: "- Fix login bug\n- Update dependencies\n- Write tests for auth module" },
  { name: "random_notes.txt", content: "Ideas for the hackathon:\n- AI-powered code review\n- Smart meeting scheduler" },
  { name: ".eslintrc.json", content: '{\n  "extends": ["eslint:recommended"],\n  "env": { "node": true }\n}' },
  { name: "tsconfig.prod.json", content: '{\n  "extends": "./tsconfig.json",\n  "compilerOptions": { "sourceMap": false }\n}' },
  { name: "package_old.json", content: '{\n  "name": "old-project",\n  "version": "0.1.0",\n  "dependencies": {}\n}' },
  { name: "credentials_template.yaml", content: "aws:\n  access_key: REPLACE_ME\n  secret_key: REPLACE_ME" },
];

function main() {
  console.log(`Generating ${FILES.length} seed files in ${SEED_DIR}...`);

  mkdirSync(SEED_DIR, { recursive: true });

  for (const file of FILES) {
    const filePath = join(SEED_DIR, file.name);
    writeFileSync(filePath, file.content, "utf-8");
  }

  console.log(`Done. Created ${FILES.length} files.`);

  if (FILES.length !== 80) {
    console.error(`WARNING: Expected 80 files, but got ${FILES.length}`);
    process.exit(1);
  }
}

main();
