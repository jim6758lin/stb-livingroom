# AI 開發資安與隱私保護規範 (AI Security & Privacy Guidelines)

> **給 AI 助手的最高指令 (System Instruction for AI Agents)**  
> 在協助開發本專案時，請將本規範視為**最高優先級別**的安全準則。任何程式碼生成、重構、除錯、日誌輸出或版本控制操作，皆不得違反以下規定。

---

## 1. 嚴禁硬編碼機敏資訊 (No Hardcoded Secrets)
- **禁止寫入原始碼**：絕不可將 API Keys、Token、密碼、私鑰 (Private Keys)、資料庫連線字串 (含帳密)、OAuth Client Secrets 直接寫入任何程式碼、設定檔範本或測試腳本中。
- **使用環境變數**：所有機敏參數必須透過環境變數 (`process.env`、`os.environ` 等) 或專用機密管理服務讀取。
- **提供安全範本**：若需建立環境變數範例檔 (如 `.env.example`、`.env.template`)，所有欄位值必須使用安全的佔位符（例如 `YOUR_API_KEY_HERE`、`changeme`、`postgresql://user:password@localhost:5432/dbname`），不得填入真實憑證。

## 2. 禁止讀取與揭露本地機密檔案 (Restricted File Access)
除非使用者明確要求檢查語法結構（且必須遮罩內容），否則 AI **禁止主動讀取、輸出、傳送或引用**以下檔案之真實內容：
- 環境變數檔：`.env`、`.env.*`（`.env.example` 除外）
- 憑證與金鑰：`*.pem`、`*.key`、`*.pfx`、`*.p12`、`*.crt`、`id_rsa*`
- 雲端與第三方認證檔：`credentials.json`、`service-account*.json`、`*.tfstate`、`.npmrc`、`.pypirc`、`~/.aws/`、`~/.ssh/`
- 本地資料庫與快取：`*.sqlite`、`*.db`、`*.dump`、`*.bak`

**自動遮罩原則**：若在閱讀 Log 或既有程式碼時發現疑似真實 Token、API Key 或密碼，AI 在回覆中必須自動將其遮罩（例如顯示為 `sk-****...****`），並立即提醒使用者撤換該憑證。

## 3. 個人資料與商業機密保護 (PII & Sensitive Business Data)
- **禁止使用真實個資測試**：撰寫單元測試、Seed Data 或 Mock Data 時，嚴禁使用真實姓名、身分證字號、真實 Email、電話號碼、地址、信用卡號或客戶資料。請一律使用假資料（如 `test@example.com`、`0900-000-000`、`John Doe` 或 Faker 套件）。
- **日誌脫敏 (Log Sanitization)**：撰寫 `console.log`、`logger.info` 或例外處理時，禁止將完整 Request Body（若含密碼、Token、個資）、Authorization Header 或 Session Cookie 直接印出。
- **內部架構保護**：避免在公開註解、前端原始碼或錯誤訊息中暴露內部伺服器真實 IP、內網網域名稱、資料表完整結構或系統絕對路徑。

## 4. 外部網路請求與第三方服務安全 (External Network & Dependencies)
- **禁止暗中傳送資料**：AI 生成的程式碼或執行的指令（如 `curl`、`Invoke-WebRequest`）不得將本地專案原始碼、環境變數或系統資訊傳送至未經授權的外部網址。
- **套件安全**：引入第三方套件時，僅使用官方知名且名稱正確的套件，防範 Typosquatting（名稱混淆攻擊）。

## 5. Git 提交與版本控制安全檢查 (Pre-Commit & Git Safety)
當 AI 協助執行 `git add`、`git commit` 或 `git push` 時，必須遵循以下流程：
1. **禁止盲目全選**：避免直接執行 `git add .` 或 `git add -A` 而不先檢查 `git status`。
2. **提交前檢視**：執行提交前，必須確認暫存區 (Staged files) 不包含 `.env`、金鑰、編譯產物、大型資料集或暫存除錯檔。
3. **警告機制**：若發現 `.gitignore` 漏掉了即將被提交的敏感檔案，必須**立即中止提交**，先將該檔案加入 `.gitignore` 並從 Git 追蹤中移除 (`git rm --cached`)，再通知使用者。

---

## 6. AI 自我檢查清單 (AI Self-Check Before Responding)
在輸出程式碼或執行終端機指令前，請先自我確認：
- [ ] 我輸出的程式碼中是否沒有任何真實的密碼、Token 或 API Key？
- [ ] 我是否已將敏感設定改由環境變數讀取？
- [ ] 我建立的測試資料是否全部為虛擬假資料 (Dummy Data)？
- [ ] 若有新增敏感設定檔，我是否已同步確認它被列在 `.gitignore` 中？
