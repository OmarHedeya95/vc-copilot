# Setup Steps
- Clone this repo into `<obsidian-vault-path>/.obsidian/plugins/vc_copilot/`

## Settings
- The Affinity settings are only needed if you are using Affinity as CRM and would like to automatically push startups and VC connections there. If you are just using it for summarization and cleaning it from markdown syntax, just fill the other settings
- Do not forget to have a '/' at the end of the vault path (otherwise it won't work)

# Usage
- After your are finished taking notes about a startup or a VC, add the correct hashtags to the note
	- For a VC -> #network/connected  and type of VC ( #Person/VC or #Entity/VC )
	- For startup -> #startups/screened 
- To summarize:
	- For a startup -> use the mouse to highlight the text you want to summarize -> `Cmd + P` -> summarize this startup
	- For a VC -> `Cmd + P` -> Summarize All VC Notes
- Check the #review and #review_startup hashtags
- Approve that everything is fine or make your changes to the summary
- Remove the #review (or #review_startup ) hashtag and add ( #Affinity ) instead
- `Cmd + P` -> Push VCs or Startups to Affinity
- Voila, data is pushed to Affinity ( the affinity hashtag will be removed automatically)
