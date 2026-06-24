# Accessify — Makefile
# 工具鏈骨架：build/test/lint 於 M0（T001）建立 npm scripts 後接上。
# ASP 治理指令委派至 ~/.claude/asp/。完整 ASP skills 見 ~/.claude/skills/asp/。

.DEFAULT_GOAL := help
.PHONY: help install build test test-filter lint coverage dev e2e \
        profile-validate asp-compile asp-audit autopilot-validate

ASP_SCRIPTS := $(HOME)/.claude/asp/scripts

help: ## 顯示可用指令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── 開發工具鏈（M0/T001 建立 npm workspaces 後生效）──
install: ## 安裝相依（離線：npm ci --offline）
	npm ci --offline

build: ## 建置
	npm run build

test: ## 執行測試（通過時寫入 ASP ship 痕跡 .asp-test-result.json）
	npm test && printf '{"passed":true,"ts":"%s"}\n' "$$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .asp-test-result.json

test-filter: ## 執行過濾測試：make test-filter FILTER=spec-001
	npm test -- $(FILTER)

lint: ## Lint（含 no-hardcoded-i18n 規則）
	npm run lint

coverage: ## 測試覆蓋率
	npm run coverage

dev: ## 本地開發
	npm run dev

e2e: ## a11y/e2e 測試（Playwright + axe；需先 npx playwright install chromium；M5 起有頁面可測）
	npx playwright test

# ── ASP 治理（已可用）──
profile-validate: ## 驗證 .ai_profile
	bash $(ASP_SCRIPTS)/validate-profile.sh .ai_profile

asp-compile: ## 重新編譯 .asp-compiled-profile.md
	bash $(ASP_SCRIPTS)/asp-compile.sh --project $(CURDIR)

asp-audit: ## 產生 session 健康簡報（提示用 /asp-audit skill 做完整審計）
	CLAUDE_PROJECT_DIR=$(CURDIR) bash $(HOME)/.claude/asp/hooks/session-audit.sh && \
	  echo "→ 完整審計請於 Claude Code 執行 /asp-audit"

autopilot-validate: ## 檢查 ROADMAP.yaml 與前置文件齊備（提示用 /asp-autopilot）
	@test -f ROADMAP.yaml && echo "ROADMAP.yaml ✓" || echo "ROADMAP.yaml ✗"
	@for d in docs/SRS.md docs/SDS.md docs/UIUX_SPEC.md docs/DEPLOY_SPEC.md; do \
	  test -f $$d && echo "$$d ✓" || echo "$$d ✗"; done
