#!/bin/bash
# Navigate to your Git repository
cd "C:\Users\irawe\OneDrive\school\.obsidian\plugins\Doing-it-myself"

# Pull the latest changes
git pull origin main

# Check for changes
if [[ `git status --porcelain` ]]; then
  # Stage all changes
  git add .

  # Commit the changes with a generic message
  git commit -m "Automated commit"

  # Push the changes to the remote repository
  git push origin main
else
  echo "No changes to commit."
fi

