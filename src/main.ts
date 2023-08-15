import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Menu, MenuItem, MarkdownFileInfo, TFile, TAbstractFile, request} from 'obsidian';
//import { WizardView, WIZARD_VIEW } from 'view';
import * as fs from 'fs';
import { execSync } from 'child_process';
const { Configuration, OpenAIApi } = require("openai");
import {get_startup_by_name, add_notes_to_company, get_person_by_name, get_person_details, is_person_in_venture_network, get_field_values, add_entry_to_list, add_field_value, add_notes_to_person} from "./utils";
import { start } from 'repl';
import { TextInputModal } from 'modal';
import { exec} from "child_process";




let pythonPath = ''
let affinityAPIKey = ''
let openaiAPIKey = ''
let owner_value = '10'
let connection_owner_field = '10'
let venture_network_list = '500'
let docker_path = '/usr/local/bin'
let bing_cookie = ''

interface ButlerSettings {
    affinityKey: string;
    openAIKey: string;
    owner_person_value: string;
    connection_owner_field_id: string;
    venture_network_list_id: string;
    _docker_path: string;
    _U_bing_cookie: string;
    pythonPath: string

}

const DEFAULT_SETTINGS: ButlerSettings = {
    affinityKey: 'default',
    openAIKey: 'default',
    owner_person_value: '10',
    connection_owner_field_id: '100',
    venture_network_list_id: '500',
    _docker_path: '/usr/local/bin',
    _U_bing_cookie: '',
    pythonPath: '<path-to-virtual-env>'

}


async function openai_js(query: String, system_prompt: String, max_tokens: number = 256, temperature: number = 0.3){
    const configuration = new Configuration({
        apiKey: openaiAPIKey,
      });
      //to avoid an annoying error/warning message
      delete configuration.baseOptions.headers['User-Agent'];

      const openai = new OpenAIApi(configuration);
      const system_message = system_prompt
      
    const response = await openai.createChatCompletion({
        model: "gpt-4",
        temperature: temperature,
        max_tokens: max_tokens,
        messages: [
            {role: "system", content: system_message},
            {role: "user", content: query} 
        ]
      });
    
    let summary = response.data.choices[0].message.content
    return summary
}

async function openai_js_multiturn(queries: string[], system_prompt: String, max_tokens: number = 256, temperature: number = 0.3){
    const configuration = new Configuration({
        apiKey: openaiAPIKey,
      });
      //to avoid an annoying error/warning message
      delete configuration.baseOptions.headers['User-Agent'];

      const openai = new OpenAIApi(configuration);
      const system_message = system_prompt

      let messages = [{role: "system", content: system_message}]
      let replies = []
 
    for (let query of queries){
        messages.push({role: "user", content: query})
        console.log(messages)
        const response = await openai.createChatCompletion({
            model: "gpt-4",
            temperature: temperature,
            max_tokens: max_tokens,
            messages: messages
          });
        let assistant_reply = response.data.choices[0].message.content
        messages.push({role: "assistant", content:assistant_reply})
        replies.push(assistant_reply)

    }

    return replies
}

async function summarize_selected_startup_text(editor: Editor, view: MarkdownView|MarkdownFileInfo, status: HTMLElement){
    /**
     * This function takes the selected text from a startup, summarizes it, and then puts it back in the file
     * The "full-text" gets appened after the heading '# Stop Indexing' such that it is not indexed anymore by the embedding engine
     * This also helps to avoid pushing all of the convoluted text into Affinity later on
     */

    const sel = editor.getSelection()
    new Notice("Summarizing...")
    status.setText('🧑‍🚀: VC Copilot summarizing...')
    status.setAttr('title', 'Copilot is summarizing...')
    

    const system_prompt = "You are a summarizer for my notes about startups. Your job is to read through my notes and create a summary in the following schema:\n\
- **Team**:<the founder team behind the startup>\n\n\
- **Product**:<the product and the problem it solves>\n\n\
- **Traction**:<how much revenue has the startup generated so far, how many customers do they have>\n\n\
- **Round**:<how much money have they raised so far at what terms. How much money are they raising now>"
    
    let new_summary = await openai_js(sel, system_prompt)
    const replacement = '#gpt_summarized, #AddHashtags, #review_startup \n'+ new_summary + '\n' + '# Stop Indexing \n## Notes\n' + sel
    editor.replaceSelection(replacement)
    status.setText('🧑‍🚀: VC Copilot ready')
    status.setAttr('title', 'Copilot is ready')
}

function startup_ready_for_affinity(file_content: string){
    return (file_content.includes('#startups/screened') && file_content.includes('#Affinity'))
}

function extract_title_and_note(text: string){
    /**
     * This function takes all the text in the file and returns the title and the body of the note.
     * The split happens based on h1 header. 
     * This means substrings[0] is usually the data before the title.
     * substrings[1] is usually the body of the note
     * if there is substring [2], this means there is another h1 header (usually # Stop Indexing)
     * Downstream tasks only deals with substring[1] as the note; i.e information after the Stop Indexing are execluded
     */

        //?gm means string is multilines, and ^ would catch beginning of every line not just beginning of the string!
        let pattern = /^# .*\n/gm;
        let matches = text.match(pattern);
        let title = ''
        if(matches){
            title = matches[0]
        }
        let substrings = text.split(pattern)
        console.log(`Title: ${title}`)
        console.log(substrings)

        return [title, substrings]

}

function clean_text(startup_name: string){
    startup_name = startup_name.replace(/[^A-Za-z0-9\s.]/g, '');
    startup_name = startup_name.trim()
    return startup_name
}

async function push_startups_to_affinity(status: HTMLElement){
        /**
     * Push all eligible startups to affinity (notify me otherwise)
     */
        const files = this.app.vault.getMarkdownFiles()
        status.setText('🧑‍🚀: VC Copilot syncing with Affinity...')
        status.setAttr('title', 'Copilot is pushing startup info to Affinity...')
    
        for (let item of files){
            let file_content = await this.app.vault.read(item)
            if (startup_ready_for_affinity(file_content)){
                let [title, substrings] = extract_title_and_note(file_content)
                let startup_name = String(title)
                startup_name = clean_text(startup_name)
                let note = substrings[1]
                note = note.replace(/^(==|\*\*|#{2,})$/g, '')

                let startup = await get_startup_by_name(affinityAPIKey, owner_value, startup_name)
                
                if (startup){
                    let response = await add_notes_to_company(startup, note, affinityAPIKey)
                    if (response == null){
                        new Notice(`Startup: ${startup_name} was NOT updated on Affinity`)


                    }
                    else{
                        new Notice(`Startup: ${startup_name} was updated on Affinity`)
                        file_content = file_content.replace(/#Affinity/g, '')
                        this.app.vault.modify(item, file_content)
                    }

                }
                else{
                    new Notice(`Startup: ${startup_name} was NOT found on Affinity`)
                }
            }
        }
        new Notice('Done!')
        status.setText('🧑‍🚀: VC Copilot ready')
        status.setAttr('title', 'Copilot is ready')

   
    

}

function is_summarizable(file_content: string){
    /**
     * Return true if the VC is to be summarized (I am connected with them and they are not already summarized)
     */
    return file_content.includes('#network/connected') && ( file_content.includes('#Entity/VC') || file_content.includes('#Person/VC') ) && (file_content.includes('#gpt_summarized') != true) && (file_content.includes('dataview') != true)

}

async function summarize_vc_text(text: string){
    /**
     * Given the full text in a VC note, this function summarizes the important part (before # Stop Indexing) and returns the new full text that should be written to the file
     * The full text includes the meta data and tags information before the title, the title, the summary, and adds the core data after the heading "# Stop Indexing"
     */

    // We should summarize only information that is before '# Stop Indexing'
    let [title, substrings] = extract_title_and_note(text)
    //We consider both data before the title (hashtags) as well as the body of the note   
    let hashtags
    try{
       hashtags = substrings[0].split('Tags:')[1]
    }
    catch{
        hashtags = substrings[0]
        new Notice(`${title}: Does not have any guiding hashtags, this could help the summarizer understand the VC better`, 3600)
    }
    let text_to_summarize = hashtags + '\n' + substrings[1]

    console.log(`Summarizing: ${title}`)


    const system_prompt = "You are a summarizer for my notes about VC Funds. Your job is to read through my notes and create a summary in the following schema:\n\
- Fund Size::<How big is the fund?>\n\
- Ticket Size::<How much does the fund invest per startup?>\n\
- Geography::<Where can the fund invest?>\n\
- Stage:: <Pre-seed, Seed, Series A, etc>\n\
- Industry::<In which industries does the fund invest?>\n\
- Special::<Any special information about the fund or the investor that I should remember>"

    const summary = await openai_js('Notes:\n' + text_to_summarize, system_prompt)

    let new_summary: string = String(summary)

    
    title = title.toString()
    let leading_text = ''
    let replacement = ''
    let tailing_text = ''//hashtags


    if(substrings){
        leading_text = substrings[0] + '\n' + title + '\n'
        for (let substring of substrings.slice(1)){
            tailing_text = tailing_text + '\n' + substring
        }
        replacement = leading_text + '#gpt_summarized, #review \n'+ new_summary + '\n' + '# Stop Indexing \n## Notes\n' + tailing_text
        return [replacement, new_summary, title]
    }
    else{
        return [text, text, '']

    }

    
}

async function summarize_all_vc(status: HTMLElement){
    /**
     * This function summarized all VC notes that are eligible for summarization (people or entities I am connected with)
     */

    const files = this.app.vault.getMarkdownFiles()
    status.setText('🧑‍🚀: VC Copilot summarizing...')
    status.setAttr('title', 'VC Copilot is summarizing all your VC connections...')
    for (let item of files){
        //console.log(item.name)
        let file_content = await this.app.vault.read(item)
        if (is_summarizable(file_content)){
            console.log(`We are changing file: ${item.name}`)
            //We should summarize this file then
            let [new_text, summary, title] = await summarize_vc_text(file_content)
            
            if (title != ''){
                this.app.vault.modify(item, new_text)
                new Notice(`${title} has been summarized`)

            }
            

            

        }
        
    }

    status.setText('🧑‍🚀: VC Copilot ready')
    status.setAttr('title', 'VC Copilot is ready')
    

    

}

function vc_ready_for_affinity(file_content: string){
    return file_content.includes('#gpt_summarized') && file_content.includes('#Affinity')
}


async function push_vcs_to_affinity(status: HTMLElement){
    /**
     * This function pushes all ready VCs to affinity, it also notifies us if a person can not be found on affinity
     */
    const files = this.app.vault.getMarkdownFiles()
    status.setText('🧑‍🚀: VC Copilot syncing with Affinity...')
    status.setAttr('title', 'Copilot is pushing VCs info to Affinity...')
    for (let item of files){
        let file_content = await this.app.vault.read(item)
        if (vc_ready_for_affinity(file_content)){
            
            let [title, substrings] = extract_title_and_note(file_content)
            let summary = substrings[1]
            let person_name = String(title)
            person_name = clean_text(person_name)
            let note = substrings[1]
            note = note.replace(/^(==|\*\*|#{2,})$/g, '')

            let person = await get_person_by_name(affinityAPIKey,person_name)

            if (person){
                let person_id = person['id']
                let person_details = await get_person_details(affinityAPIKey, person_id)
                let list_entry_id = await is_person_in_venture_network(affinityAPIKey, person_details, venture_network_list)

                if (list_entry_id != null){
                    //if person is in venture network
                    //todo I think removing this will have no negative effect?
                    //let person_venture_network_fields = await get_field_values(affinityAPIKey, 'list_entry_id', list_entry_id)

                }
                else{
                    //Add the person to venture network first
                    await add_entry_to_list(affinityAPIKey, venture_network_list, person_id)
                    let person_details = await get_person_details(affinityAPIKey, person_id)

                    list_entry_id = await is_person_in_venture_network(affinityAPIKey, person_details, venture_network_list)  
                    //Add note taker as owner of the connection on Affinity
                    await add_field_value(affinityAPIKey, connection_owner_field, person_id, owner_value, list_entry_id)     

                }

                



                let result = await add_notes_to_person(affinityAPIKey, person_id, note)

                if (result){
                    new Notice(`VC: ${person_name} was updated on Affinity`)
                    file_content = file_content.replace(/#Affinity/g, '')
                    this.app.vault.modify(item, file_content)
                }
                else{
                    new Notice(`VC: ${person_name} was FOUND but NOT updated on Affinity`)

                }

            }
            else{
                new Notice(`VC: ${person_name} was NOT FOUND on Affinity`)

            }
        

        }

    }
    status.setText('🧑‍🚀: VC Copilot ready')
    status.setAttr('title', 'Copilot is ready')

}







export default class VCCopilotPlugin extends Plugin{
    settings: ButlerSettings;
    status: HTMLElement;
    
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new VCCopilotSettingsTab(this.app, this));
        this.status = this.addStatusBarItem();


        this.addCommand({id: 'summarize-startup-command', name: 'Summarize This Startup', editorCallback: (editor, view) => summarize_selected_startup_text(editor, view, this.status)})
        this.addCommand({id: 'affinity-startup', name: 'Push Startups to Affinity', callback: () => push_startups_to_affinity(this.status)})
        this.addCommand({id: 'summarize-all-vc-command', name: 'Summarize All VC Notes', callback: () => summarize_all_vc(this.status)})
        this.addCommand({id: 'affinity-vc', name: 'Push VCs to Affinity', callback: () => push_vcs_to_affinity(this.status)})

        this.addCommand({
            id: 'startup-defensibility',
            name: 'Evaluate Startup Defensibility',
            editorCallback: (editor: Editor) => {
              const inputModal = new TextInputModal(this.app, 'defensibility',(input) => {
                // Handle the submitted text here
                console.log('Submitted text:', input);
                this.defensibility_analysis(input, editor)


              });
              inputModal.open();
            },
          });

          this.addCommand({
            id: 'startup-workflow',
            name: 'Startup Guidance Workflow',
            editorCallback: (editor: Editor) => {
              const inputModal = new TextInputModal(this.app, 'evaluate',(input) => {
                // Handle the submitted text here
                console.log('Submitted text:', input);
                this.guidance_workflow(input, editor)


              });
              inputModal.open();
            },
          });


        this.addCommand({
            id: 'market-map-command',
            name: 'Market Map',
            editorCallback: (editor: Editor) => {
              const inputModal = new TextInputModal(this.app, 'market-research',(input) => {
                // Handle the submitted text here
                console.log('Submitted text:', input);
                this.market_map(input, editor);

              });
              inputModal.open();
            },
          });

          this.addCommand({
            id: 'market-research-command',
            name: 'Market Research',
            editorCallback: (editor: Editor) => {
              const inputModal = new TextInputModal(this.app, 'market-research',(input) => {
                // Handle the submitted text here
                console.log('Submitted text:', input);
                this.market_research(input, editor);

              });
              inputModal.open();
            },
          });

          this.addCommand({
            id: 'url-research-command',
            name: 'Url Research',
            editorCallback: (editor: Editor) => {
              const inputModal = new TextInputModal(this.app, 'Url Research',(input) => {
                // Handle the submitted text here
                console.log('Submitted text:', input);
                this.url_research(input, editor);

              });
              inputModal.open();
            },
          });

        this.status.setText('🧑‍🚀: VC Copilot loading....')
        this.status.setAttr('title', 'VC Copilot is loading...')

        exec(`export PATH=$PATH:${docker_path} && docker run -p 8080:8080 -d omar/expressjs:1.0`, (error, stdout, stderr) => {
            if(error){
                console.error(`JS container creation error: ${error}`); 
                new Notice('Could not run JS container'); 
                return;
            }
            console.log(`stdout (JS creation of container): ${stdout}`)
            console.log(`stderr (JS creation of container): ${stderr}`)
            new Notice('JS container created')

        })

        exec(`export PATH=$PATH:${docker_path} && docker run -p 3030:3030 -d copilot/python_server:1.0`, (error, stdout, stderr) => {
            if(error){
                console.error(`Python container creation error: ${error}`); 
                new Notice('Could not run Python container'); 
                return;
            }
            console.log(`stdout (python creation of container): ${stdout}`)
            console.log(`stderr (python creation of container): ${stderr}`)
            new Notice('Python container created')

        })

        this.status.setText('🧑‍🚀: VC Copilot ready')
        this.status.setAttr('title', 'VC Copilot is ready')
    
    
    
    }

    onunload() {
        this.status.setText('🧑‍🚀: VC Copilot left')
        this.status.setAttr('title', 'VC Copilot says 👋')
        exec(`export PATH=$PATH:${docker_path} && docker rm $(docker stop $(docker ps -a -q --filter ancestor=omar/expressjs:1.0))`, (error, stdout, stderr) => {
            if(error){console.error(`JS container stop error\n${error}`); return;}
            console.log(`stdout (JS stop container): ${stdout}`)
            console.log(`stderr (JS stop container): ${stderr}`)
            new Notice('JS Container stopped successfully')
        })

        exec(`export PATH=$PATH:${docker_path} && docker rm $(docker stop $(docker ps -a -q --filter ancestor=copilot/python_server:1.0))`, (error, stdout, stderr) => {
            if(error){console.error(`Python container stop error\n${error}`); return;}
            console.log(`stdout (Python stop container): ${stdout}`)
            console.log(`stderr (Python stop container): ${stderr}`)
            new Notice('Python Container stopped successfully')
        })

    }

    async loadSettings(){
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        openaiAPIKey = this.settings.openAIKey
        affinityAPIKey = this.settings.affinityKey
        owner_value = this.settings.owner_person_value
        connection_owner_field = this.settings.connection_owner_field_id
        venture_network_list = this.settings.venture_network_list_id
        pythonPath = this.settings.pythonPath
        docker_path = this.settings._docker_path
        bing_cookie = this.settings._U_bing_cookie
    }
    async saveSettings(){
        await this.saveData(this.settings)
        openaiAPIKey = this.settings.openAIKey
        affinityAPIKey = this.settings.affinityKey
        owner_value = this.settings.owner_person_value
        connection_owner_field = this.settings.connection_owner_field_id
        venture_network_list = this.settings.venture_network_list_id
        pythonPath = this.settings.pythonPath
        docker_path = this.settings._docker_path
        bing_cookie = this.settings._U_bing_cookie
    }

    async url_research(url: string, editor: Editor){
        this.status.setText(`🧑‍🚀 🔎: VC Copilot researching ${url}...`)
        this.status.setAttr('title', 'Copilot is researching the url')

        const res = await fetch("http://localhost:3030", {
            method: "post",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                url: url,
                openai_key: openaiAPIKey
            })
        })
    
        var final_text = await res.text()
        final_text = `## ${url} Research\n` + final_text
        final_text = final_text.replace('Problem to be solved:', '#### Problem to be solved')
        final_text = final_text.replace("Product:", "#### Product")
        final_text = final_text.replace('Features:', '#### Features')
        final_text = final_text.replace('Business Model:', '#### Business Model')
        final_text = final_text.replace('Competition:', '#### Competition')
        final_text = final_text.replace('Vision:', '#### Vision')
        final_text = final_text.replace('Extras:', '#### Extras')
        
        editor.replaceRange(final_text, editor.getCursor());

        this.status.setText('🧑‍🚀: VC Copilot ready')
        this.status.setAttr('title', 'Copilot is ready')

    }

    async market_map(industry: string, editor: Editor){
        this.status.setText('🧑‍🚀 🔎: VC Copilot mapping the market...')
        this.status.setAttr('title', 'Copilot is mapping the market...')

        const res = await fetch("http://localhost:8080/map", {
            method: "post",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                prompt: industry,
                cookie: bing_cookie
            })
        })

        const message = await res.text()

        editor.replaceRange(message, editor.getCursor())

        this.status.setText('🧑‍🚀: VC Copilot ready')
        this.status.setAttr('title', 'Copilot is ready')


    }

    async market_research(industry: string, editor: Editor){

        this.status.setText('🧑‍🚀 🔎: VC Copilot researching the market...')
        this.status.setAttr('title', 'Copilot is researching the market...')

        const res = await fetch("http://localhost:8080/research", {
            method: "post",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                prompt: industry,
                cookie: bing_cookie
            })
        })
        const message = await res.text()

        editor.replaceRange(message, editor.getCursor())

        this.status.setText('🧑‍🚀: VC Copilot ready')
        this.status.setAttr('title', 'Copilot is ready')

    }

    async defensibility_analysis (startup_description: string, editor: Editor){
                        
        let system_prompt: string = "Use the following guidelines to determine what kinds of defensibility a startup can build with time:\n\
        - **Network effect**: When every user creates more value for other users, forming a positive feedback loop. This can be local or global, and is one of the few forms of defensibility that can arise immediately upon launch of a company.\n\
        - **Platform effect**: When a company becomes a sticky product because so many other companies have integrated against it. This usually comes after a company has enough users that others want to build against its platform to reach them.\n\
        - **Integrations**: When a company integrates against many other APIs, code bases, etc. that are hard to reproduce, or when a company's services do integrations for the company against other vendors. This makes it hard to displace the company as each implementation is a unique and complex process.\n\
        - **Building a ton of stuff**: When a company bundles and cross sells products that prevent other companies from finding a wedge to compete with them, or when a company has a big product footprint that makes it hard for new entrants to reach feature parity.\n\
        - **Deals**: When a company secures early access, exclusive provider or distribution, or backend deals that give it scale, brand, or access advantages over competitors. This may include deals with APIs, data sources, regulators, or customers.\n\
        - **Sales as moat**: When a company locks in customers with long term contracts, or has a sales process that makes it easier for enterprises to buy from them than from new suppliers. This may include security reviews, procurement processes, or pricing strategies.\n\
        - **Regulatory**: When a company receives regulatory approvals that provide a moat. This may include licenses, permits, or exemptions that are hard to obtain or replicate by competitors.\n\
        - **Data or system of record effect**: When a company has unique or proprietary data, or owns a customer's data or has a long historical record of it. This can create defensibility by making the data more valuable and harder to switch away from. Similarly, being a system of record for a user, entity, etc. can be a powerful position to be in.\n\
        - **Scale effects**: When a company has access to large sums of money or business volume that allows it to do things that will make it difficult for competitors to upend them. This may include capital scale, business scale and negotiation, or pricing advantages.\n\
        - **Open source**: When a company benefits from being the creator or contributor of an open source software project that is widely used or adopted by developers. This can create defensibility by giving the company brand recognition, community influence, and talent access.\n\
        - **Brand**: When a company becomes synonymous with the thing they do, often by creating a new product category, or doing something vastly better than competitors. This can create defensibility by making the company the default choice for customers and creating loyalty and trust.\n\
        - **IP moat**: When a company has intellectual property that protects its product or technology from being copied or infringed by competitors. This tends to be more effective in hard tech or biotech companies than most consumer or SaaS products.\n\
        - **Speed**: When a company can execute faster and better than competitors, especially incumbents. This can create defensibility by allowing the company to iterate quickly, respond to customer feedback, and hire and close candidates faster.\n\
        - **Pricing**: When a company can offer a lower price than competitors due to a lower cost structure, a lack of an existing product to cannibalize, or a different business model. This can create defensibility by attracting more customers and creating higher margins.\n\
        - **New business models**: When a company can innovate on business model to create a higher leverage business or different incentive structure. This can create defensibility by disrupting incumbents who are used to traditional ways of doing things.\nAlways think step by step!"
                        
        let query = 'Startup Description:\n' + startup_description + '\nWhat types of defensibility does this startup have? Which types of defensibility does it lack or could improve upon? Let us think step by step'
                        

        this.status.setText('🧑‍🚀: VC Copilot analyzing defensibility...')
        this.status.setAttr('title', 'VC Copilot is analyzing defensibility of the startup...')
        let analysis = await openai_js(query, system_prompt, 1024, 1.0)

        analysis = '## Defensibility Analysis\n' + analysis
        
        editor.replaceRange(analysis, editor.getCursor());

        this.status.setText('🧑‍🚀: VC Copilot ready')
        this.status.setAttr('title', 'VC Copilot is ready')
    }

    async guidance_workflow(startup_description: string, editor: Editor){
        let system_prompt = "You are a helpful assistant to a venture capital investor. Your main job is guiding the investor to always focus on the bigger picture and find the core arguments they should focus us. Your arguments are always concise and to the point. When needed, you can guide the investor by asking questions that help them focus on the essentials.\n\
In your analysis, you should always be customer-centric and focused on the target customer of the startup.\n\
The following aspects are extremely crucial to the investor:\n\
- Who is the target customer for the startup?\n\
- What is the hardest part about the job of the target customer?\n\
- What is the startup's unique value proposition for the target customer?"

    let query = 'Startup Description:\n' + startup_description + '\nWhat is the core problem this startup is solving?'
    let user_queries = []
    user_queries.push(query)
    let hypothesis = "What are the core hypotheses the startup has to validate to prove that solving this core problem is important enough to allow them to build a unicorn?"
    user_queries.push(hypothesis)
    let classify = "Recommend some suitable product categories to classify the product"
    user_queries.push(classify)

    this.status.setText('🧑‍🚀: VC Copilot analyzing startup...')
    this.status.setAttr('title', 'VC Copilot is analyzing the startup...')
    let replies = await openai_js_multiturn(user_queries, system_prompt, 1024, 1.0)

    replies[0] = '#### Core Problem\n' + replies[0] + '\n'
    replies[1] = '#### Hypotheses\n' + replies [1] + '\n'
    replies [2] = '#### Categories\n' + replies[2] + '\n'

    let final_text = replies[0] + replies[1] + replies[2]

    editor.replaceRange(final_text, editor.getCursor());

    this.status.setText('🧑‍🚀: VC Copilot ready')
    this.status.setAttr('title', 'VC Copilot is ready')



}

    

}

class VCCopilotSettingsTab extends PluginSettingTab{
    plugin: VCCopilotPlugin
    constructor(app: App, plugin: VCCopilotPlugin){
        super(app, plugin)
        this.plugin = plugin
    }
    display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for your copilot'});

        new Setting(containerEl)
        .setName('OpenAI API Key')
        .setDesc('Your OpenAI API Key')
        .addText(text => text
            .setPlaceholder('Enter key')
            .setValue(this.plugin.settings.openAIKey)
            .onChange(async (value) => {
                console.log('Open AI key: ' + value);
                this.plugin.settings.openAIKey = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Affinity: API Key')
        .setDesc('Your Affinity API Key')
        .addText(text => text
            .setPlaceholder('Enter key')
            .setValue(this.plugin.settings.affinityKey)
            .onChange(async (value) => {
                console.log('key: ' + value);
                this.plugin.settings.affinityKey = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Affinity: Owner Value')
        .setDesc('Every person has a code on Affinity. Please give in the code for the person that should be added as owner of startups and VCs that gets pushed')
        .addText(text => text
            .setPlaceholder('Enter value')
            .setValue(this.plugin.settings.owner_person_value)
            .onChange(async (value) => {
                console.log('Owner value: ' + value);
                this.plugin.settings.owner_person_value = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Affinity: Connection Owner Field ID')
        .setDesc('Depending on the list you save fellow VCs in, there is a field that represent the \'connection owner with the fund\', enter the field id here')
        .addText(text => text
            .setPlaceholder('Enter value')
            .setValue(this.plugin.settings.connection_owner_field_id)
            .onChange(async (value) => {
                console.log('Connection Owner Field ID value: ' + value);
                this.plugin.settings.connection_owner_field_id = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Affinity: Venture Network List ID')
        .setDesc('Please enter the list id for the list you save your relationships with VCs in')
        .addText(text => text
            .setPlaceholder('Enter value')
            .setValue(this.plugin.settings.venture_network_list_id)
            .onChange(async (value) => {
                console.log('Venture network list id: ' + value);
                this.plugin.settings.venture_network_list_id = value;
                await this.plugin.saveSettings();
            }));
        
        new Setting(containerEl)
            .setName('Docker Path')
            .setDesc('The path of your docker installation. Check it through: terminal => where docker')
            .addText(text => text
                .setPlaceholder('Enter path')
                .setValue(this.plugin.settings._docker_path)
                .onChange(async (value) => {
                    //console.log('Open AI key: ' + value);
                    this.plugin.settings._docker_path = value;
                    await this.plugin.saveSettings();
                }));
            
        new Setting(containerEl)
            .setName('Bing AI _U Cookie')
            .setDesc('The value of the _U cookie for Bing AI (find it from browser)')
            .addText(text => text
                .setPlaceholder('Enter cookie value')
                .setValue(this.plugin.settings._U_bing_cookie)
                .onChange(async (value) => {
                    //console.log('Open AI key: ' + value);
                    this.plugin.settings._U_bing_cookie = value;
                    await this.plugin.saveSettings();
                }));
	}

}