@echo off
REM Setup demo data for screenshot capture

echo Setting up demo data for screenshots...
echo.

REM Clean up any active sessions first
echo Cleaning up stale sessions...
cs recover --max-age 0 >nul 2>&1

REM Session 1: Quick documentation task
echo Creating Session 1: Documentation update...
cs start "Docs: Update README examples" --json --close-stale >nul
cs note "Updating code examples in README" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 2000 --completion-tokens 500 --agent "Documentation Bot" --json >nul
cs end -n "Updated all README code examples" --json >nul
echo   √ Session 1 complete ($0.01)

REM Session 2: Bug fix with multiple AI calls
echo Creating Session 2: Bug fix...
cs start "Fix: Authentication token expiry" --json --close-stale >nul
cs note "Analyzing auth flow" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 5000 --completion-tokens 1500 --agent "Bug Fixer" --json >nul
cs note "Implementing fix" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 3000 --completion-tokens 800 --agent "Bug Fixer" --json >nul
cs note "Adding test coverage" --json >nul
cs log-ai -p openai -m gpt-4o --prompt-tokens 4000 --completion-tokens 1200 --agent "Test Writer" --json >nul
cs end -n "Auth bug fixed, tests passing" --json >nul
echo   √ Session 2 complete ($0.07)

REM Session 3: Feature implementation with research
echo Creating Session 3: Feature implementation...
cs start "Feature: Add rate limiting to API" --json --close-stale >nul
cs note "Researching rate limiting strategies" --json >nul
cs log-ai -p anthropic -m claude-opus-4-6 --prompt-tokens 12000 --completion-tokens 3000 --agent "Research Agent" --json >nul
cs note "Implementing Redis-based rate limiter" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 6000 --completion-tokens 2000 --agent "Code Review Bot" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 4000 --completion-tokens 1200 --agent "Code Review Bot" --json >nul
cs note "Adding integration tests" --json >nul
cs log-ai -p openai -m gpt-4o --prompt-tokens 5000 --completion-tokens 1500 --agent "Test Writer" --json >nul
cs end -n "Rate limiting feature complete with tests" --json >nul
echo   √ Session 3 complete ($0.52)

REM Session 4: Refactoring task
echo Creating Session 4: Refactoring...
cs start "Refactor: Database query optimization" --json --close-stale >nul
cs note "Analyzing slow queries" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 7000 --completion-tokens 2000 --agent "Performance Analyzer" --json >nul
cs note "Adding indexes and optimizing queries" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 5000 --completion-tokens 1500 --agent "Database Expert" --json >nul
cs end -n "Query performance improved by 5x" --json >nul
echo   √ Session 4 complete ($0.06)

REM Session 5: Active multi-agent session (leave open)
echo Creating Session 5: Active multi-agent workflow...
cs start "Feature: User dashboard with analytics" --json --close-stale >nul
cs note "Starting dashboard UI design" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 8000 --completion-tokens 2500 --agent "Frontend Dev" --json >nul
cs note "Implementing chart components" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 6000 --completion-tokens 1800 --agent "Frontend Dev" --json >nul
cs note "Backend API integration in progress" --json >nul
cs log-ai -p anthropic -m claude-sonnet-4 --prompt-tokens 4000 --completion-tokens 1200 --agent "Backend Dev" --json >nul
echo   √ Session 5 active ($0.09 so far)

echo.
echo Demo data setup complete!
echo.
echo Summary:
echo   • 4 completed sessions
echo   • 1 active session
echo   • Multiple agents: Bug Fixer, Test Writer, Research Agent, etc.
echo   • Total cost: ~$0.75
echo.
echo Next step:
echo   Run: npm run capture-screenshots
echo.
