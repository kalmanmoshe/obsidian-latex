$path = "C:\Users\irawe\Desktop\school\.obsidian\plugins\Doing-it-myself"
$filter = "*.*"

# Check if the path exists
if (-Not (Test-Path $path)) {
    Write-Host "Path does not exist: $path"
    exit
}

# Create a FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $path
$watcher.Filter = $filter
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Function to run git commands
function Commit-And-Push {
    Write-Host "Change detected. Processing..."
    try {
        cd $path

        # Check if there are any changes to commit
        $status = git status --porcelain
        if (-Not [string]::IsNullOrWhiteSpace($status)) {
            Write-Host "Committing changes..."
            $env:GIT_EDITOR = "true" # Force non-interactive editor mode
            git add -A
            git commit -m "Auto-commit: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        } else {
            Write-Host "No changes to commit."
        }

        # Pull with rebase to sync with remote
        Write-Host "Pulling latest changes from GitHub..."
        git pull origin main --rebase

        # Push the changes
        Write-Host "Pushing changes to GitHub..."
        git push origin main

        Write-Host "Changes successfully pushed to GitHub!"
    } catch {
        Write-Host "Error occurred: $_"

        # Check for merge conflicts and try to resolve them
        if ($_ -like "*CONFLICT*") {
            Write-Host "Merge conflict detected. Attempting to resolve..."
            git add -A
            git commit -m "Auto-resolve merge conflicts"
            git rebase --continue
            git push origin main
        }
    }
}

# Define the action to be taken on change
$action = {
    Write-Host "File changed: $($EventArgs.FullPath) at $(Get-Date)"
    Commit-And-Push
    Start-Sleep -Milliseconds 100 # Give some time to flush the output
}

# Register event handlers
$changeEvent = Register-ObjectEvent $watcher Changed -Action $action
$createEvent = Register-ObjectEvent $watcher Created -Action $action
$deleteEvent = Register-ObjectEvent $watcher Deleted -Action $action
$renameEvent = Register-ObjectEvent $watcher Renamed -Action $action

Write-Host "Watching for changes in $path. Press Enter to exit."
Read-Host

# Clean up event registrations
Unregister-Event -SourceIdentifier $changeEvent.Name
Unregister-Event -SourceIdentifier $createEvent.Name
Unregister-Event -SourceIdentifier $deleteEvent.Name
Unregister-Event -SourceIdentifier $renameEvent.Name
