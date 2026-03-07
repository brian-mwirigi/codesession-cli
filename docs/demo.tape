# codesession-cli demo GIF
# Records a quick walkthrough: cs run → cs show → cs dashboard

Output docs/demo.gif
Output docs/demo.webm

Set Shell "pwsh"
Set FontSize 15
Set Width 1000
Set Height 600
Set Padding 20
Set Theme { "name": "codesession", "black": "#09090b", "red": "#ef4444", "green": "#22c55e", "yellow": "#eab308", "blue": "#3b82f6", "magenta": "#a855f7", "cyan": "#06b6d4", "white": "#e4e4e7", "brightBlack": "#71717a", "brightRed": "#f87171", "brightGreen": "#4ade80", "brightYellow": "#facc15", "brightBlue": "#60a5fa", "brightMagenta": "#c084fc", "brightCyan": "#22d3ee", "brightWhite": "#fafafa", "background": "#09090b", "foreground": "#e4e4e7", "cursor": "#3b82f6", "selection": "#27272a" }
Set TypingSpeed 40ms
Set CursorBlink false

# Title pause
Sleep 1s

# Show version
Type "cs --version"
Enter
Sleep 1.5s

# Start a session with cs run
Type "cs run -- echo 'Hello from my agent'"
Sleep 500ms
Enter
Sleep 3s

# Show the result
Type "cs show"
Sleep 500ms
Enter
Sleep 3s

# Show stats
Type "cs stats --json"
Sleep 500ms
Enter
Sleep 2.5s

# Show today
Type "cs today"
Sleep 500ms
Enter
Sleep 3s

# Open dashboard
Type "cs dashboard"
Sleep 500ms
Enter
Sleep 3s

# Final pause
Sleep 2s
