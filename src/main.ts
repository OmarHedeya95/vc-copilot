import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  Menu,
  MenuItem,
  MarkdownFileInfo,
  TFile,
  TAbstractFile,
  request,
  EditorPosition,
  FileSystemAdapter,
} from "obsidian";

import {
  get_startup_by_name,
  add_notes_to_company,
  get_person_by_name,
  get_person_details,
  is_person_in_venture_network,
  get_field_values,
  add_entry_to_list,
  add_field_value,
  add_notes_to_person,
  startup_ready_for_affinity,
  extract_title_and_note,
  clean_text,
  is_summarizable,
  vc_ready_for_affinity,
  countWords,
} from "./utils";

import { PDFModal, MultipleTextInputModal, TextInputModal } from "./modal";

import OpenAI, { toFile } from "openai";

import * as fs from "fs";

import { format_url_text } from "./formatter";

import { specific_web_research, you_research } from "./search";

import {
  DEFENSIBILITY_ANALYSIS_SYSTEM_PROMPT,
  GUIDANCE_WORKFLOW_SYSTEM_PROMPT,
} from "./prompts";

import { get_meeting_id, get_meeting_transcript_by_id } from "./fireflies";
import { start } from "repl";
import { match } from "assert";

let affinityAPIKey = "";
let openaiAPIKey = "";
let owner_value = "10";
let connection_owner_field = "10";
let venture_network_list = "500";
let investor_names: string[] = [];
let fireflies_api_key = "";
let intervalId: any;
let openai: OpenAI;

export const gpt_3_latest = "gpt-3.5-turbo-1106";
export const gpt_4_latest = "gpt-4-1106-preview";

interface ButlerSettings {
  affinityKey: string;
  openAIKey: string;
  owner_person_value: string;
  connection_owner_field_id: string;
  venture_network_list_id: string;
  team_names: string;
  fireflies_api: string;
}

const DEFAULT_SETTINGS: ButlerSettings = {
  affinityKey: "default",
  openAIKey: "default",
  owner_person_value: "10",
  connection_owner_field_id: "100",
  venture_network_list_id: "500",
  team_names: "Ben Horrowitz, Vinod Khosla",
  fireflies_api: "default",
};

async function openai_js(
  model_name: string,
  user_prompt: string,
  system_prompt: string,
  max_tokens: number = 256,
  temperature: number = 0.3
) {
  const response = await openai.chat.completions.create({
    model: model_name, //gpt-4-1106-preview
    temperature: temperature,
    max_tokens: max_tokens,
    messages: [
      { role: "system", content: system_prompt },
      { role: "user", content: user_prompt },
    ],
  });

  let summary = response.choices[0].message.content;
  if (summary == null) {
    summary = "";
  }
  return summary;
}

async function openai_js_multiturn(
  queries: string[],
  system_prompt: string,
  max_tokens: number = 256,
  temperature: number = 0.3
) {
  const system_message = system_prompt;

  let messages = [{ role: "system", content: system_message }];

  let replies: string[] = [];

  for (let query of queries) {
    messages.push({ role: "user", content: query });
    console.log(messages);

    const response = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      temperature: temperature,
      max_tokens: max_tokens,
      messages: messages,
    });

    let assistant_reply = response.choices[0].message.content;
    if (assistant_reply == null) {
      assistant_reply = "";
    }

    messages.push({ role: "assistant", content: assistant_reply });
    replies.push(assistant_reply);
  }

  return replies;
}

async function summarize_vc_text(text: string) {
  /**
   * Given the full text in a VC note, this function summarizes the important part (before # Stop Indexing) and returns the new full text that should be written to the file
   * The full text includes the meta data and tags information before the title, the title, the summary, and adds the core data after the heading "# Stop Indexing"
   */

  // We should summarize only information that is before '# Stop Indexing'
  let [title, substrings] = extract_title_and_note(text);
  //We consider both data before the title (hashtags) as well as the body of the note
  let hashtags;
  try {
    hashtags = substrings[0].split("Tags:")[1];
  } catch {
    hashtags = substrings[0];
    new Notice(
      `${title}: Does not have any guiding hashtags, this could help the summarizer understand the VC better`,
      3600
    );
  }
  let text_to_summarize = hashtags + "\n" + substrings[1];

  console.log(`Summarizing: ${title}`);

  const system_prompt =
    "You are a summarizer for my notes about VC Funds. Your job is to read through my notes and create a summary in the following schema:\n\
- Fund Size::<How big is the fund?>\n\
- Ticket Size::<How much does the fund invest per startup?>\n\
- Geography::<Where can the fund invest?>\n\
- Stage:: <Pre-seed, Seed, Series A, etc>\n\
- Industry::<In which industries does the fund invest?>\n\
- Special::<Any special information about the fund or the investor that I should remember>";

  const summary = await openai_js(
    gpt_4_latest,
    "Notes:\n" + text_to_summarize,
    system_prompt
  );

  let new_summary: string = String(summary);

  title = title.toString();
  let leading_text = "";
  let replacement = "";
  let tailing_text = ""; //hashtags

  if (substrings) {
    leading_text = substrings[0] + "\n" + title + "\n";
    for (let substring of substrings.slice(1)) {
      tailing_text = tailing_text + "\n" + substring;
    }
    replacement =
      leading_text +
      "#gpt_summarized, #review \n" +
      new_summary +
      "\n" +
      "# Stop Indexing \n## Notes\n" +
      tailing_text;
    return [replacement, new_summary, title];
  } else {
    return [text, text, ""];
  }
}

async function summarize_paragraph(paragraph: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4-1106-preview", //gpt-4 gpt-3.5-turbo
    messages: [
      {
        role: "system",
        content:
          'You are a helpful note-taking assistant for a venture capital investor. You will be given a part of a transcript for the call between the investor and the startup founder. Your task is to extract information covering the following aspects:\n- **Team**:<Who is the team behind the startup. Answer in bullet points!>\n- **Problem**:<What is the problem the startup is solving and for whom. Answer in bullet points!>\n- **Product**:<How does their product solve this problem. Answer in bullet points!>\n- **Traction**:<How does their customer traction look like. Answer in bullet points!>\n- **Competition**:<How does the competitive landscape look like. Answer in bullet points!>\n- **Round Info**:<How much money are they raising from investors currently? How much have they raised before? Answer in bullet points!>\n- **Other**: <Other important points about the founders OR the startup that do not fit in the above sections. Answer in bullet points!>\n\nFor every section, always give your answers in bullet points! Otherwise, say "No Relevant Information"',
      },
      {
        role: "user",
        content: `${paragraph}`, //You are a helpful note-taking assistant for a venture capital investor. You will be given a part of a transcript for the call between the investor and the startup founder. You should focus only on information about the startup. Ignore any information about the investor themselves or the venture capital firm they represent. Your task is to extract information from the transcript covering the following sections:\n- Team: <Who is the team behind the startup>\n- Problem: <What is the problem the startup is solving>\n- Product: <How does their product solve this problem>\n- Traction: <How does their customer traction look like>\n- Competition: <How does the competitive landscape look like>\n- Round Info: <How much money are they raising from investors currently? How much have they raised before?>\n- Other: <Other important points about the founders OR the startup that do not fit in the above sections>\n\nFor every section always give your answers in bullet points! Otherwise say \"No Relevant Information\" infront of the section's name.\n\nTranscript:\n
      },
    ],
    temperature: 0,
    max_tokens: 1024,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });

  let reply = response.choices[0].message.content;
  console.log(reply);
  if (reply == null) {
    reply = "";
  }
  return reply;
}

async function summarize_all_paragraphs_together(paragraphs: any[]) {
  let input_text = "";

  for (let i = 0; i < paragraphs.length; i++) {
    input_text += `Summary #${i + 1}:\n`;
    input_text += paragraphs[i] + "\n\n";
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4-1106-preview", // gpt-3.5-turbo
    messages: [
      {
        role: "system",
        content:
          'You are a helpful assistant. Your task is to expand the first summary you are given by the information in all the subsequent summaries. The final summary you provide should cover ALL following sections:\n- **Team**: <Who is the team behind the startup>\n- **Problem**: <What is the problem the startup is solving and for whom>\n- **Product**: <How does their product solve this problem>\n- **Traction**: <How does their customer traction look like>\n- **Competition**: <How does the competitive landscape look like>\n- **Round Info**: <How much money are they raising from investors currently? How much have they raised before?>\n- **Other**: <Other important points about the founders OR the startup that do not fit in the above sections>\n\nDo not leave any empty sections. For every section always give your answers in bullet points! Otherwise say "No Relevant Information" infront of the section\'s name.',
      },
      {
        role: "user",
        content: `${input_text}`,
      },
    ],
    temperature: 0,
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });

  let reply = response.choices[0].message.content;
  if (reply == null) {
    reply = "";
  }
  return reply;
}

function extractHeadersFromNotes(notes: string) {
  const headerRegex = /^#+\s+.+$/gm;
  const headers: string[] = [];
  let match;

  while ((match = headerRegex.exec(notes)) !== null) {
    headers.push(match[0]);
  }

  return headers;
}

function findLineNumber(
  fileText: string,
  searchString: string,
  startLine: number
) {
  const fileContent = fileText; //fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split("\n");
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].includes(searchString)) {
      //todo make just i and the i-2 to i-1!
      return [i, lines[i]];
    }
  }
  return [null, null];
}

function getStartHeader(update_type: string) {
  let startHeader = "";

  if (update_type.toLowerCase() == "team") {
    startHeader = "#### Team";
  } else if (update_type.toLowerCase() == "ideal customer profile") {
    startHeader = "#### Problem";
  } else if (update_type.toLowerCase() == "product") {
    startHeader = "#### Product";
  } else if (update_type.toLowerCase() == "competition") {
    startHeader = "#### Competition";
  } else if (
    update_type.toLowerCase() == "commercial traction" ||
    update_type.toLowerCase() == "market size"
  ) {
    startHeader = "#### Traction";
  } else if (update_type.toLowerCase() == "funding") {
    startHeader = "#### Round Info";
  }
  return startHeader;
}

function getCursorRange(
  fileText: string,
  startHeader: string,
  editor: Editor,
  allHeaders: string[]
) {
  let startLineNumber;
  let matchedHeader;
  [startLineNumber, matchedHeader] = findLineNumber(fileText, startHeader, 0);
  console.log(`Matched Header: ${matchedHeader}`);
  console.log(`Found in line: ${startLineNumber}`);
  let startCursorPosition: EditorPosition | null = null;
  let endCursorPosition: EditorPosition | null = null;
  if (startLineNumber) {
    editor.setCursor(startLineNumber);
    startCursorPosition = editor.getCursor();

    let endLineNumber;
    let endMatchedHeader;
    endLineNumber = editor.lastLine();
    if (allHeaders.indexOf(matchedHeader) < allHeaders.length - 1) {
      let nextHeader = allHeaders[allHeaders.indexOf(matchedHeader) + 1];

      [endLineNumber, endMatchedHeader] = findLineNumber(
        fileText,
        nextHeader,
        startLineNumber
      );
      console.log(`Matched Next Header: ${nextHeader}`);
      console.log(`Found in line: ${endLineNumber}`);
    }

    if (endLineNumber) {
      endLineNumber -= 1;
      editor.setCursor(endLineNumber);
      endCursorPosition = editor.getCursor();
    }
  }

  return [startCursorPosition, endCursorPosition, matchedHeader];
}

async function update_affinity_startup(startup_name: string, note: string) {
  let startup;
  try {
    let startup = await get_startup_by_name(
      affinityAPIKey,
      owner_value,
      startup_name
    );
  } catch (e) {
    new Notice(`Can not establish connection with Affinity`);
    return;
  }

  if (startup) {
    let response = await add_notes_to_company(startup, note, affinityAPIKey);
    if (response == null) {
      new Notice(`Startup: ${startup_name} was NOT updated on Affinity`);
      return false;
    } else {
      new Notice(`Startup: ${startup_name} was updated on Affinity`);
      return true;
    }
  } else {
    new Notice(`Startup: ${startup_name} was NOT found on Affinity`);
    return false;
  }
}

export default class VCCopilotPlugin extends Plugin {
  settings: ButlerSettings;
  status: HTMLElement;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new VCCopilotSettingsTab(this.app, this));
    this.status = this.addStatusBarItem();

    this.addCommand({
      id: "summarize-startup-command",
      name: "Summarize This Startup",
      editorCallback: (editor, view) =>
        this.summarize_selected_startup_text(editor, view, this.status),
    });

    this.addCommand({
      id: "reformat-and-update-master-note",
      name: "Reformat & Update Master Note",
      editorCallback: (editor, view) =>
        this.reformat_and_update_master_note(editor),
    });

    this.addCommand({
      id: "reformat-notes",
      name: "Reformat Notes",
      editorCallback: (editor, view) => this.reformat_notes(editor),
    });

    this.addCommand({
      id: "update-master-note",
      name: "Update Master Note",
      editorCallback: (editor, view) =>
        this.update_master_note_with_selected_text(editor),
    });

    this.addCommand({
      id: "affinity-startup",
      name: "Push Startups to Affinity",
      callback: () => this.push_startups_to_affinity(this.status),
    });
    this.addCommand({
      id: "summarize-all-vc-command",
      name: "Summarize All VC Notes",
      callback: () => this.summarize_all_vc(this.status),
    });
    this.addCommand({
      id: "affinity-vc",
      name: "Push VCs to Affinity",
      callback: () => this.push_vcs_to_affinity(this.status),
    });

    this.addCommand({
      id: "startup-defensibility",
      name: "Evaluate Startup Defensibility",
      editorCallback: (editor: Editor) => {
        const inputModal = new TextInputModal(
          this.app,
          "defensibility",
          (input) => {
            // Handle the submitted text here
            console.log("Submitted text:", input);
            this.defensibility_analysis(input, editor);
          }
        );
        inputModal.open();
      },
    });

    this.addCommand({
      id: "startup-workflow",
      name: "Startup Guidance Workflow",
      editorCallback: (editor: Editor) => {
        const inputModal = new TextInputModal(this.app, "evaluate", (input) => {
          // Handle the submitted text here
          console.log("Submitted text:", input);
          this.guidance_workflow(input, editor);
        });
        inputModal.open();
      },
    });

    this.addCommand({
      id: "market-research-command",
      name: "Market Research",
      editorCallback: (editor: Editor) => {
        const inputModal = new TextInputModal(
          this.app,
          "market-research",
          (input) => {
            // Handle the submitted text here
            console.log("Submitted text:", input);
            this.market_research(input, editor);
          }
        );
        inputModal.open();
      },
    });

    this.addCommand({
      id: "url-research-command",
      name: "Url Research",
      editorCallback: (editor: Editor) => {
        const inputModal = new TextInputModal(
          this.app,
          "url-research",
          (input) => {
            // Handle the submitted text here
            console.log("Submitted text:", input);
            this.url_research(input, editor);
          }
        );
        inputModal.open();
      },
    });

    this.addCommand({
      id: "competition-research-command",
      name: "Competition Research",
      editorCallback: (editor: Editor) => {
        const inputModal = new TextInputModal(
          this.app,
          "competition",
          (input) => {
            // Handle the submitted text here
            console.log("Submitted text:", input);
            this.competition_research(input, editor);
          }
        );
        inputModal.open();
      },
    });

    this.addCommand({
      id: "deck-analysis",
      name: "Summarize Pitch Deck",
      editorCallback: (editor: Editor) => {
        const inputModal = new PDFModal(this.app, (selected_file) => {
          new Notice(`Selected: '${selected_file}`);
          this.analyze_pitch_deck(selected_file, editor);
        });
        inputModal.open();
      },
    });

    this.addCommand({
      id: "custom-research",
      name: "Custom Research",
      editorCallback: (editor: Editor) => {
        const inputModal = new MultipleTextInputModal(this.app, "", (input) => {
          // Handle the submitted text here
          let result = input.split(", ");
          let website = result[0];
          let query = result[1];
          let task = result[2];
          console.log("Submitted text:", input);
          this.custom_search(task, website, query, editor);
        });
        inputModal.open();
      },
    });

    this.addCommand({
      id: "fireflies-summary",
      name: "Fireflies Call Summary",
      editorCallback: (editor: Editor) => {
        const inputModal = new TextInputModal(
          this.app,
          "fireflies-summary",
          (input) => {
            // Handle the submitted text here
            console.log("Submitted text:", input);
            this.fireflies_summary(input, editor);
          }
        );
        inputModal.open();
      },
    });

    openai = await new OpenAI({
      apiKey: openaiAPIKey,
      dangerouslyAllowBrowser: true,
    });
    this.status.setText("🧑‍🚀: VC Copilot loading....");
    this.status.setAttr("title", "VC Copilot is loading...");

    this.status.setText("🧑‍🚀: VC Copilot ready");
    this.status.setAttr("title", "VC Copilot is ready");
  }

  onunload() {
    this.status.setText("🧑‍🚀: VC Copilot left");
    this.status.setAttr("title", "VC Copilot says 👋");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    openaiAPIKey = this.settings.openAIKey;
    affinityAPIKey = this.settings.affinityKey;
    owner_value = this.settings.owner_person_value;
    connection_owner_field = this.settings.connection_owner_field_id;
    venture_network_list = this.settings.venture_network_list_id;
    fireflies_api_key = this.settings.fireflies_api;

    this.settings.team_names.split(",").forEach((element) => {
      investor_names.push(element.trim());
    });
  }
  async saveSettings() {
    await this.saveData(this.settings);
    openaiAPIKey = this.settings.openAIKey;
    affinityAPIKey = this.settings.affinityKey;
    owner_value = this.settings.owner_person_value;
    connection_owner_field = this.settings.connection_owner_field_id;
    venture_network_list = this.settings.venture_network_list_id;
    fireflies_api_key = this.settings.fireflies_api;
    this.settings.team_names.split(",").forEach((element) => {
      investor_names.push(element.trim());
    });
  }

  async summarize_selected_startup_text(
    editor: Editor,
    view: MarkdownView | MarkdownFileInfo,
    status: HTMLElement
  ) {
    /**
     * This function takes the selected text from a startup, summarizes it, and then puts it back in the file
     * The "full-text" gets appened after the heading '# Stop Indexing' such that it is not indexed anymore by the embedding engine
     * This also helps to avoid pushing all of the convoluted text into Affinity later on
     */

    const sel = editor.getSelection();
    new Notice("Summarizing...");
    status.setText("🧑‍🚀: VC Copilot summarizing...");
    status.setAttr("title", "Copilot is summarizing...");

    const system_prompt =
      "You are a summarizer for my notes about startups. Your job is to read through my notes and create a summary in the following schema:\n\
- **Team**:<the founder team behind the startup>\n\n\
- **Product**:<the product and the problem it solves>\n\n\
- **Traction**:<how much revenue has the startup generated so far, how many customers do they have>\n\n\
- **Round**:<how much money have they raised so far at what terms. How much money are they raising now>";

    let new_summary = await openai_js(gpt_4_latest, sel, system_prompt);
    const replacement =
      "#gpt_summarized, #AddHashtags, #review_startup \n" +
      new_summary +
      "\n" +
      "# Stop Indexing \n## Notes\n" +
      sel;
    editor.replaceSelection(replacement);
    status.setText("🧑‍🚀: VC Copilot ready");
    status.setAttr("title", "Copilot is ready");
  }

  async push_startups_to_affinity(status: HTMLElement) {
    /**
     * Push all eligible startups to affinity (notify me otherwise)
     */
    const files = this.app.vault.getMarkdownFiles();
    status.setText("🧑‍🚀: VC Copilot syncing with Affinity...");
    status.setAttr("title", "Copilot is pushing startup info to Affinity...");

    for (let item of files) {
      let file_content = await this.app.vault.read(item);
      if (startup_ready_for_affinity(file_content)) {
        let [title, substrings] = extract_title_and_note(file_content);
        let startup_name = String(title);
        startup_name = clean_text(startup_name);
        let note = substrings[1];
        note = note.replace(/^(==|\*\*|#{2,})$/g, "");

        let startup_updated = await update_affinity_startup(startup_name, note);

        if (startup_updated) {
          //remove the #Affinity
          file_content = file_content.replace(/#Affinity/g, "");
          this.app.vault.modify(item, file_content);
        }
      }
    }

    new Notice("Done!");
    status.setText("🧑‍🚀: VC Copilot ready");
    status.setAttr("title", "Copilot is ready");
  }

  async summarize_all_vc(status: HTMLElement) {
    /**
     * This function summarized all VC notes that are eligible for summarization (people or entities I am connected with)
     */

    const files = this.app.vault.getMarkdownFiles();
    status.setText("🧑‍🚀: VC Copilot summarizing...");
    status.setAttr(
      "title",
      "VC Copilot is summarizing all your VC connections..."
    );
    for (let item of files) {
      //console.log(item.name)
      let file_content = await this.app.vault.read(item);
      if (is_summarizable(file_content)) {
        console.log(`We are changing file: ${item.name}`);
        //We should summarize this file then
        let [new_text, summary, title] = await summarize_vc_text(file_content);

        if (title != "") {
          this.app.vault.modify(item, new_text);
          new Notice(`${title} has been summarized`);
        }
      }
    }

    status.setText("🧑‍🚀: VC Copilot ready");
    status.setAttr("title", "VC Copilot is ready");
  }

  async push_vcs_to_affinity(status: HTMLElement) {
    /**
     * This function pushes all ready VCs to affinity, it also notifies us if a person can not be found on affinity
     */
    const files = this.app.vault.getMarkdownFiles();
    status.setText("🧑‍🚀: VC Copilot syncing with Affinity...");
    status.setAttr("title", "Copilot is pushing VCs info to Affinity...");
    for (let item of files) {
      let file_content = await this.app.vault.read(item);
      if (vc_ready_for_affinity(file_content)) {
        let [title, substrings] = extract_title_and_note(file_content);
        let summary = substrings[1];
        let person_name = String(title);
        person_name = clean_text(person_name);
        let note = substrings[1];
        note = note.replace(/^(==|\*\*|#{2,})$/g, "");

        let person = await get_person_by_name(affinityAPIKey, person_name);

        if (person) {
          let person_id = person["id"];
          let person_details = await get_person_details(
            affinityAPIKey,
            person_id
          );
          let list_entry_id = await is_person_in_venture_network(
            affinityAPIKey,
            person_details,
            venture_network_list
          );

          if (list_entry_id != null) {
            //if person is in venture network
            //todo I think removing this will have no negative effect?
            //let person_venture_network_fields = await get_field_values(affinityAPIKey, 'list_entry_id', list_entry_id)
          } else {
            //Add the person to venture network first
            await add_entry_to_list(
              affinityAPIKey,
              venture_network_list,
              person_id
            );
            let person_details = await get_person_details(
              affinityAPIKey,
              person_id
            );

            list_entry_id = await is_person_in_venture_network(
              affinityAPIKey,
              person_details,
              venture_network_list
            );
            //Add note taker as owner of the connection on Affinity
            await add_field_value(
              affinityAPIKey,
              connection_owner_field,
              person_id,
              owner_value,
              list_entry_id
            );
          }

          let result = await add_notes_to_person(
            affinityAPIKey,
            person_id,
            note
          );

          if (result) {
            new Notice(`VC: ${person_name} was updated on Affinity`);
            file_content = file_content.replace(/#Affinity/g, "");
            this.app.vault.modify(item, file_content);
          } else {
            new Notice(
              `VC: ${person_name} was FOUND but NOT updated on Affinity`
            );
          }
        } else {
          new Notice(`VC: ${person_name} was NOT FOUND on Affinity`);
        }
      }
    }
    status.setText("🧑‍🚀: VC Copilot ready");
    status.setAttr("title", "Copilot is ready");
  }

  async url_research(url: string, editor: Editor) {
    this.status.setText(`🧑‍🚀 🔎: VC Copilot researching ${url}...`);
    this.status.setAttr("title", "Copilot is researching the url");

    let final_text = "";
    let position = editor.getCursor();

    try {
      const res = await fetch(
        "https://url-researcher-container-xm5lmdnsxq-ey.a.run.app",
        {
          method: "post",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url,
            openai_key: openaiAPIKey,
          }),
        }
      );

      final_text = await res.text();
      final_text = format_url_text(final_text, url);
    } catch (error) {
      console.log(`Error when doing url research: ${error}`);
      new Notice(`Error when doing url research`);
    }

    this.displaymessage(final_text, editor, position);
  }

  async defensibility_analysis(startup_description: string, editor: Editor) {
    let position = editor.getCursor();
    let system_prompt: string = DEFENSIBILITY_ANALYSIS_SYSTEM_PROMPT;
    let query =
      "Startup Description:\n" +
      startup_description +
      "\nWhat types of defensibility does this startup have? Which types of defensibility does it lack or could improve upon? Let us think step by step";

    this.status.setText("🧑‍🚀: VC Copilot analyzing defensibility...");
    this.status.setAttr(
      "title",
      "VC Copilot is analyzing defensibility of the startup..."
    );
    let analysis = await openai_js(
      gpt_4_latest,
      query,
      system_prompt,
      1024,
      1.0
    );

    analysis = "## Defensibility Analysis\n" + analysis;

    this.displaymessage(analysis, editor, position);
  }

  async guidance_workflow(startup_description: string, editor: Editor) {
    let position = editor.getCursor();
    let system_prompt = GUIDANCE_WORKFLOW_SYSTEM_PROMPT;

    let query =
      "Startup Description:\n" +
      startup_description +
      "\nWhat is the core problem this startup is solving? Give a concise answer.";

    let user_queries: string[] = [];
    user_queries.push(query);
    let hypothesis =
      "What are the core hypotheses the startup has to validate to prove that solving this core problem is important enough to allow them to build a unicorn?";
    user_queries.push(hypothesis);
    let classify =
      "Recommend some suitable product categories to classify the product";
    user_queries.push(classify);

    this.status.setText("🧑‍🚀: VC Copilot analyzing startup...");
    this.status.setAttr("title", "VC Copilot is analyzing the startup...");
    let replies: string[] = await openai_js_multiturn(
      user_queries,
      system_prompt,
      1024,
      1.0
    );

    replies[0] =
      "## Analysis Workflow\n\n#### Core Problem\n\n" + replies[0] + "\n";
    replies[1] = "#### Hypotheses\n\n" + replies[1] + "\n";
    replies[2] = "#### Categories\n\n" + replies[2] + "\n";

    let final_text = replies[0] + replies[1] + replies[2];

    this.displaymessage(final_text, editor, position);
  }

  async fireflies_summary(meeting_name: string, editor: Editor) {
    this.status.setText(
      `🧑‍🚀 🔎: VC Copilot reading the transcript of ${meeting_name}...`
    );
    this.status.setAttr("title", "Copilot is reading the transcript");

    let final_summary = "";

    let cursor_position = editor.getCursor();

    try {
      let id = await get_meeting_id(meeting_name, fireflies_api_key);
      let paragraphs = await get_meeting_transcript_by_id(id, investor_names);
      let summaries: string[] = [];

      let long_paragraph = "";
      let extended_paragraphs: string[] = [];

      for (let paragraph of paragraphs) {
        let number_of_words = countWords(paragraph);

        if (number_of_words >= 12) {
          //Include only sentences that are long enough to be relevant
          if (number_of_words + countWords(long_paragraph) <= 2500) {
            //keep a paragraph below 1500 words (2000 tokens) for the context window
            long_paragraph += paragraph;
          } else {
            extended_paragraphs.push(long_paragraph);
            long_paragraph = paragraph;
          }
        }
      }
      if (long_paragraph.length != 0) {
        extended_paragraphs.push(long_paragraph);
      }
      this.status.setText(
        `🧑‍🚀 🔎: VC Copilot summarizing sections of the transcript of ${meeting_name}...`
      );
      this.status.setAttr(
        "title",
        "Copilot is summarizing sections of the transcript"
      );
      for (let paragraph of extended_paragraphs) {
        let summary = await summarize_paragraph(paragraph);
        summaries.push(summary);
        //console.log(summary)
      }
      this.status.setText(
        `🧑‍🚀 🔎: VC Copilot summarizing the full transcript of ${meeting_name}...`
      );
      this.status.setAttr(
        "title",
        "Copilot is summarizing the full transcript"
      );

      final_summary = await summarize_all_paragraphs_together(summaries);
      final_summary = final_summary.replace(/\*\*Team(:)?\*\*/g, "#### Team");
      final_summary = final_summary.replace(
        /\*\*Problem(:)?\*\*/g,
        "#### Problem"
      );
      final_summary = final_summary.replace(
        /\*\*Product(:)?\*\*/g,
        "#### Product"
      );
      final_summary = final_summary.replace(
        /\*\*Traction(:)?\*\*/g,
        "#### Traction"
      );
      final_summary = final_summary.replace(
        /\*\*Competition(:)?\*\*/g,
        "#### Competition"
      );
      final_summary = final_summary.replace(
        /\*\*Round Info(:)?\*\*/g,
        "#### Round Info"
      );
      final_summary = final_summary.replace(/\*\*Other(:)?\*\*/g, "#### Other");
      final_summary = final_summary.replace("- #### Team", "#### Team");
      final_summary = final_summary.replace("- #### Problem", "#### Problem");
      final_summary = final_summary.replace("- #### Product", "#### Product");
      final_summary = final_summary.replace("- #### Traction", "#### Traction");
      final_summary = final_summary.replace(
        "- #### Competition",
        "#### Competition"
      );
      final_summary = final_summary.replace(
        "- #### Round Info",
        "#### Round Info"
      );
      final_summary = final_summary.replace("- #### Other", "#### Other");
      final_summary =
        `## ${meeting_name} call summary` +
        "\n#review_startup\n" +
        final_summary;
      //todo change the bold item with just subheaders similar to url research
    } catch (error) {
      console.log(`Error during fireflies summary: ${error}`);
      new Notice(`Error during fireflies summary`);
    }

    editor.replaceRange(final_summary, cursor_position);
    this.status.setText("🧑‍🚀: VC Copilot ready");
    this.status.setAttr("title", "Copilot is ready");
  }

  async market_research(industry: string, editor: Editor) {
    this.status.setText("🧑‍🚀 🔎: VC Copilot researching the market...");
    this.status.setAttr("title", "Copilot is researching the market...");

    let res;
    let position = editor.getCursor();

    try {
      let websites = ["", "globenewswire.com", "statista.com"];

      let query = `${industry} industry market report.`;

      let promises = websites.map((website) =>
        specific_web_research("market-research", website, query, openai, editor)
      );
      let results = await Promise.all(promises);
      let message = results.join("\n\n");

      message += "#### Further Material\n";
      message += "Here are some reading material for further information\n\n";
      query = `${industry} industry primer pdf`;

      let pdfs = await you_research(query);

      for (let element of pdfs) {
        let snippets = element["snippets"];
        let title = element["title"];
        let url = element["url"];
        message += "- " + `[${title}](${url})` + "\n";
      }

      message = "## Market Research\n" + message;

      this.displaymessage(message, editor, position);
    } catch (error) {
      console.log(`Error when doing market research: ${error}`);
      new Notice(`Error when doing market research`);
    }
  }

  async competition_research(query: string, editor: Editor) {
    let position = editor.getCursor();
    this.status.setText("🧑‍🚀 🔎: VC Copilot researching competition...");
    this.status.setAttr("title", "Copilot is researching competition...");

    try {
      let websites = ["techcrunch.com", "businessinsider.com"]; //, "news.ycombinator.com", "sifted.eu", "reddit.com"]
      //for (let website of websites)
      //{

      let promises = websites.map((website) =>
        specific_web_research("competition", website, query, openai, editor)
      );
      let results = await Promise.all(promises);
      let message = results.join("\n\n");

      //message = message.replace(/### Competition Research/gm, '')
      message = "## Competition Research\n" + message;
      this.displaymessage(message, editor, position);

      //}
    } catch (error) {
      console.log(`Error when doing market research: ${error}`);
      new Notice(`Error when doing market research`);
    }
  }

  async displaymessage(
    message: string,
    editor: Editor,
    position: EditorPosition
  ) {
    editor.replaceRange(message, position);
    this.status.setText("🧑‍🚀: VC Copilot ready");
    this.status.setAttr("title", "Copilot is ready");
  }

  async custom_search(
    task: string,
    website: string,
    search_query: string,
    editor: Editor
  ) {
    this.status.setText("🧑‍🚀 🔎: VC Copilot surfing the internet...");
    this.status.setAttr("title", "Copilot is surfing...");
    let position = editor.getCursor();
    let message = await specific_web_research(
      task,
      website,
      search_query,
      openai,
      editor
    );
    this.displaymessage(message, editor, position);
  }

  async getPathAndTextOfActiveFile() {
    let file = this.app.workspace.getActiveFile();
    let vault_path = file?.vault.adapter.basePath;
    let filePath = vault_path + "/" + file?.path;
    let fileText = fs.readFileSync(filePath, "utf-8");

    return [filePath, fileText];
  }

  async reformat_notes(editor: Editor) {
    let notes = editor.getSelection();
    let message_without_headers = "";
    let activeFile = await this.app.workspace.getActiveFile();
    let fileText;
    const system_prompt = `Act as a veteran venture capital investor. You are very precise and concise. You are tasked with helping a junior venture capital investor in his due diligence about a startup. You always write full sentences in bullet points. Always mention hard facts like numbers and statistics.`;
    const user_prompt = `The notes of the junior venture capitalist will be delimited by triple quotes. Understand the context of these notes then summarize them more clearly and concisely in bullet points. Do not generate key takeaways or another summary after the initial bullet points.\n\n"""${notes}"""`;

    this.status.setText("🧑‍🚀: VC Copilot rewriting notes...");
    this.status.setAttr("title", "VC Copilot is rewriting notes...");
    const headers = extractHeadersFromNotes(notes);

    let message = await openai_js(
      gpt_3_latest,
      user_prompt,
      system_prompt,
      256,
      0
    );

    //Add the headers back to the reformatted text
    message_without_headers = message;
    for (let i = headers.length - 1; i >= 0; i--) {
      message = headers[i] + "\n" + message;
    }

    //update the notes section
    if (activeFile) {
      fileText = await this.app.vault.process(activeFile, (data) => {
        return data.replace(notes, message);
      });
    } else {
      new Notice(
        `You must remain on the file where you want the command to work`
      );
      return "";
    }

    return message_without_headers;
  }

  async reformat_and_update_master_note(editor: Editor) {
    let activeFile = await this.app.workspace.getActiveFile();
    let message_without_headers = await this.reformat_notes(editor);

    if (activeFile) {
      await this.update_master_note_with_notes(
        message_without_headers,
        activeFile,
        editor
      );
    } else {
      new Notice(
        `You must remain on the file where you want the command to work`
      );
      return;
    }

    this.status.setText("🧑‍🚀: VC Copilot ready");
    this.status.setAttr("title", "Copilot is ready");
  }

  async update_master_note_with_selected_text(editor: Editor) {
    let activeFile = this.app.workspace.getActiveFile();
    let notes = editor.getSelection();
    if (activeFile) {
      await this.update_master_note_with_notes(notes, activeFile, editor);
    } else {
      new Notice(
        `You must remain on the file where you want the command to work`
      );
      return;
    }
  }

  async update_master_note_with_notes(
    notes: string,
    activeFile: TFile,
    editor: Editor
  ) {
    let fileText;
    //Create update messages which include updates to each category
    let text_with_category = await this.categorize_notes(notes);
    let updates = this.get_updates_from_categories(text_with_category);
    let update_messages = this.create_update_messages(updates);

    if (activeFile) {
      fileText = await this.app.vault.read(activeFile);
    } else {
      new Notice(
        `You must remain on the file where you want the command to work`
      );
      return;
    }

    const allHeaders = extractHeadersFromNotes(fileText);
    //console.log(allHeaders);

    let startHeader = "#### Team";

    let affinity_updates: string[] = [];

    //For every key in the updates, add the updates to the right place
    for (const update_type in update_messages) {
      fileText = await this.app.vault.read(activeFile);
      const update_text: string = update_messages[update_type];
      startHeader = getStartHeader(update_type);

      if (startHeader == "") {
        new Notice(
          `The active file does not have the usual startup file format`
        );
        continue;
      }

      let startCursorPosition;
      let endCursorPosition;
      let matchedHeader;

      [startCursorPosition, endCursorPosition, matchedHeader] = getCursorRange(
        fileText,
        startHeader,
        editor,
        allHeaders
      );

      let originalText = editor.getRange(
        startCursorPosition,
        endCursorPosition
      );

      originalText = matchedHeader + originalText;
      console.log(`Text found in between: ${originalText}`);

      //add changes to the file
      if (activeFile) {
        await this.app.vault.process(activeFile, (data) => {
          return data.replace(
            originalText,
            originalText + `\n\n${update_text}`
          );
        });
      }

      affinity_updates.push(update_text);
    }

    if (affinityAPIKey != "" && affinityAPIKey != "default") {
      let startup_name = activeFile.basename;
      for (let affinity_update of affinity_updates) {
        update_affinity_startup(startup_name, affinity_update);
      }
    }
  }

  get_updates_from_categories(text_with_category: string) {
    let updates = {};
    let lines = text_with_category.split("\n");
    for (let line of lines) {
      let chunks = line.split("::");
      let text = chunks[0];
      let category = chunks[1];

      if (!updates.hasOwnProperty(category)) {
        updates[category] = [text];
      } else {
        updates[category].push(text);
      }
    }

    return updates;
  }

  create_update_messages(updates: { [key: string]: string[] }) {
    let messages: string[] = [];
    let update_messages = {};
    const today = new Date();
    const currentDate = today.toISOString().split("T")[0];
    for (let [category, updates_array] of Object.entries(updates)) {
      let message = `###### ${category} updates on ${currentDate}\n\n`;
      for (let update of updates_array) {
        message = message + update + "\n";
      }

      update_messages[category] = message;
    }

    return update_messages;
  }

  async categorize_notes(notes: string) {
    const response = await openai.chat.completions.create({
      model: gpt_3_latest, //gpt-4 gpt-3.5-turbo, gpt-4-1106-preview
      messages: [
        {
          role: "system",
          content:
            "You are Frederick, an AI expert in classifying sentences. You are tasked with reading a sentence and deciding to which category it belongs. Remember you're the best AI sentence analyzer and will use your expertise to provide the best possible analysis.",
        },
        {
          role: "user",
          content: `I will give you some sentences about a startup, and you will analyze each sentence choose the right category. You have to choose from the following categories:
- Team: <describes the team behind the startup>
- Product: <describes the product the startup is developing>
- Competition: <describes the competition the startup is facing>
- Ideal Customer Profile: <describes the ideal customer for the startup>
- Funding: <describes the money raised by the startup and its investors>
- Market Size: <describes how big the market is>
- Commercial Traction: <describes the revenues of the startup>
- Other: <does not fit into any of the above categories>

For each sentence reply in the format of \`sentence::category\` Got it?`, //You are a helpful note-taking assistant for a venture capital investor. You will be given a part of a transcript for the call between the investor and the startup founder. You should focus only on information about the startup. Ignore any information about the investor themselves or the venture capital firm they represent. Your task is to extract information from the transcript covering the following sections:\n- Team: <Who is the team behind the startup>\n- Problem: <What is the problem the startup is solving>\n- Product: <How does their product solve this problem>\n- Traction: <How does their customer traction look like>\n- Competition: <How does the competitive landscape look like>\n- Round Info: <How much money are they raising from investors currently? How much have they raised before?>\n- Other: <Other important points about the founders OR the startup that do not fit in the above sections>\n\nFor every section always give your answers in bullet points! Otherwise say \"No Relevant Information\" infront of the section's name.\n\nTranscript:\n
        },
        {
          role: "assistant",
          content:
            "Yes, I understand. I am ready to analyze your sentences and choose the correct category. I will reply in the format of `sentence::category`",
        },
        {
          role: "user",
          content: `Sentences:\n"""${notes}"""`,
        },
      ],
      temperature: 0,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    let reply = response.choices[0].message.content;
    if (reply == null) {
      reply = "";
    }
    return reply;
  }

  //OpenAI Assistant functions

  async analyze_pitch_deck(relative_path: string, editor: Editor) {
    //let absolute_path = vault_path + relative_path;
    let vault_path = "";
    let adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      vault_path = adapter.getBasePath();
    }

    console.log(vault_path);
    let absolute_path = vault_path + "/" + relative_path;

    this.status.setText("🧑‍🚀: VC Copilot analyzing deck");
    this.status.setAttr("title", "Copilot is analyzing");

    this.assistant_start_conv(absolute_path, editor);
  }

  //! OpenAI Assistant Methods
  async assistant_replace_citations(openai: any, message: any) {
    let message_content = message.content[0].text;
    let annotations = message_content.annotations;
    let citations: string[] = [];

    for (let i = 0; i < annotations.length; i++) {
      let annotation = annotations[i];

      let annotation_text = annotation.text;

      message_content.value = await message_content.value.replace(
        annotation_text,
        `[${i + 1}]`
      );

      // Gather citations based on annotation attributes
      if (annotation.file_citation) {
        const cited_file = await openai.files.retrieve(
          annotation.file_citation.file_id
        );
        citations.push(
          `##### [${i + 1}]\n ${annotation.file_citation.quote}\n **from ${
            cited_file.filename
          }**`
        ); //
      } else if (annotation.file_path) {
        const cited_file = await openai.files.retrieve(
          annotation.file_path.file_id
        );
        citations.push(
          `##### [${i + 1}] Click <here> to download ${cited_file.filename}`
        );
      }
    }

    message_content.value += "\n\n#### Sources:\n" + citations.join("\n\n");

    return message;
  }

  async assistant_displaymessage(
    openai: any,
    thread: any,
    run: any,
    messages: any,
    editor: Editor,
    editor_position: EditorPosition
  ) {
    let message = messages.data[0];

    message = await this.assistant_replace_citations(openai, message);

    let final_message = message.content[0].text.value;

    //console.log()

    this.displaymessage(final_message, editor, editor_position);
    /*editor.replaceRange(final_message, editor.getCursor())
        this.status.setText('🧑‍🚀: VC Copilot ready')
        this.status.setAttr('title', 'Copilot is ready')*/

    //todo here you could ask for the second message from the user if you would like
  }

  async assistant_check_thread_status(
    openai: any,
    thread: any,
    run: any,
    editor: Editor,
    editor_position: EditorPosition
  ) {
    const run_status = await openai.beta.threads.runs.retrieve(
      thread.id,
      run.id
    );

    console.log(run_status.status);

    if (run_status.status == "completed") {
      console.log("successful!");
      clearInterval(intervalId);

      const messages = await openai.beta.threads.messages.list(thread.id);

      this.assistant_displaymessage(
        openai,
        thread,
        run,
        messages,
        editor,
        editor_position
      );
    }
  }

  async assistant_start_conv(deck_path: string, editor: Editor) {
    let editor_position = editor.getCursor();

    //const openai = new OpenAI({apiKey: openaiAPIKey, dangerouslyAllowBrowser: true})

    //!OpenAI does not support electron yet, this is a work around (https://github.com/openai/openai-node/issues/284)
    let deck = await toFile(fs.createReadStream(deck_path));

    const file = await openai.files.create({
      file: deck, //deck_path,
      purpose: "assistants",
    });

    const assistant = await openai.beta.assistants.create({
      name: "Deck Master",
      instructions:
        "You are a veteran venture capital investor. You are extremely analytical and detail-oriented. You always answer in nested bullet points. Always break down long bullet points into multiple short ones.",
      tools: [{ type: "retrieval" }], //code_interpreter
      model: gpt_3_latest,
      file_ids: [file.id],
    });

    const thread = await openai.beta.threads.create();

    //Add message to thread
    const message = await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content:
        "Read through this pitch deck. Extract the following information:\n\
- Team\n\
- Problem the startup is solving\n\
- Solution\n\
- Competition\n\
- Commercial Traction:\n\
- Market size",
      file_ids: [file.id],
    });

    //Run thread with the message
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    intervalId = setInterval(
      () =>
        this.assistant_check_thread_status(
          openai,
          thread,
          run,
          editor,
          editor_position
        ),
      500
    );
  }
}

class VCCopilotSettingsTab extends PluginSettingTab {
  plugin: VCCopilotPlugin;
  constructor(app: App, plugin: VCCopilotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Settings for your copilot" });

    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("Your OpenAI API Key")
      .addText((text) =>
        text
          .setPlaceholder("Enter key")
          .setValue(this.plugin.settings.openAIKey)
          .onChange(async (value) => {
            this.plugin.settings.openAIKey = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("Affinity: API Key")
      .setDesc("Your Affinity API Key")
      .addText((text) =>
        text
          .setPlaceholder("Enter key")
          .setValue(this.plugin.settings.affinityKey)
          .onChange(async (value) => {
            this.plugin.settings.affinityKey = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("Affinity: Owner Value")
      .setDesc(
        "Every person has a code on Affinity. Please give in the code for the person that should be added as owner of startups and VCs that gets pushed"
      )
      .addText((text) =>
        text
          .setPlaceholder("Enter value")
          .setValue(this.plugin.settings.owner_person_value)
          .onChange(async (value) => {
            this.plugin.settings.owner_person_value = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Affinity: Connection Owner Field ID")
      .setDesc(
        "Depending on the list you save fellow VCs in, there is a field that represent the 'connection owner with the fund', enter the field id here"
      )
      .addText((text) =>
        text
          .setPlaceholder("Enter value")
          .setValue(this.plugin.settings.connection_owner_field_id)
          .onChange(async (value) => {
            this.plugin.settings.connection_owner_field_id = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("Affinity: Venture Network List ID")
      .setDesc(
        "Please enter the list id for the list you save your relationships with VCs in"
      )
      .addText((text) =>
        text
          .setPlaceholder("Enter value")
          .setValue(this.plugin.settings.venture_network_list_id)
          .onChange(async (value) => {
            this.plugin.settings.venture_network_list_id = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Investor Names")
      .setDesc(
        "Enter the names of your team members (investors) separated by a comma. This helps the Fireflies summarizer to focus more on the founder"
      )
      .addText((text) =>
        text
          //.setPlaceholder('Ben Horrowitz,...')
          .setValue(this.plugin.settings.team_names)
          .onChange(async (value) => {
            //console.log('Open AI key: ' + value);
            this.plugin.settings.team_names = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Fireflies API Key")
      .setDesc("Enter the Fireflies API Key")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.fireflies_api)
          .onChange(async (value) => {
            this.plugin.settings.fireflies_api = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
