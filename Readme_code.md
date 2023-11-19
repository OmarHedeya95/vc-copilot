# Setup Steps 
## Javascript (If you want to be able to edit the code)
- `npm i` -> updates and installs packages
- `npm install python-shell` -> if not already installed
- `npm run dev` -> this puts you in the build modus, such that the product gets rebuilt everytime you save it
- Folder should be copied to <vault-path>/.obisidan/plugins

# Explanation
- The code lives in main.ts. Everytime you change something and you save it, it gets compiled into main.js. Obsidian can only run main.js. The reason we write code in Typescript is because it reduces the potential for errors. Typescript is almost the same like Javascript, but it requires that you define all datatypes for example in advance.
- The AI and pushing stuff into Affinity happens in Python scripts. We use the python-shell module from Javascript such that we can run the python scripts and send them data. The data gets passed as "argumets" to the script, and we read back whatever the python script "prints" (no real value passing, that's why people usually run python on the backend and use APIs to communicate)
