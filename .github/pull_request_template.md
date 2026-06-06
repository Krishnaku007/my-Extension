### Summary
- 
- 
- 

### Testing
- [ ] `node --check background/service-worker.js`
- [ ] `node --check popup/popup.js`
- [ ] `node --check content/content.js`
- [ ] `node --check utils/trust-score.js`
- [ ] `node --check utils/domain-checker.js`
- [ ] `node --check utils/detector.js`
- [ ] `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); JSON.parse(require('fs').readFileSync('data/software-database.json','utf8')); console.log('json ok')"`

### Notes
- 
