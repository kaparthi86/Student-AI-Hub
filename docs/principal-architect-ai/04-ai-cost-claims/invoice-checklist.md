# Provider Invoice & Usage Checklist

Do **not** commit real invoices with account numbers to a public repo.

- [ ] Download Hugging Face invoice PDF for [[MONTH]]  
- [ ] Export usage CSV → fill `usage-export-template.csv`  
- [ ] Confirm `HF_MODEL` / router URL matches production `/api/health`  
- [ ] Capture cache env: `HF_RESPONSE_CACHE_TTL_SEC`, max entries, prompt-cache flags  
- [ ] Screenshot billing portal header with date (redact account id)  
- [ ] Store private pack path: `[[SECURE_DRIVE_PATH]]`  
- [ ] Cross-link totals into `before-after-comparison.md`  
- [ ] Optional: Render host invoice (compute ≠ model tokens — keep separate)
