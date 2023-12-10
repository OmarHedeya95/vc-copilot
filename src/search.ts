import { request, Editor, Notice } from "obsidian";
import { gpt_3_latest, gpt_4_latest } from "./main";

async function specific_web_research(
  task: string,
  website: string,
  search_query: string,
  openai: any,
  editor: Editor
) {
  let presentation_prompt = "Summarize the following paragraphs.";
  let title = "New Section";
  if (task.toLowerCase() == "competition") {
    title = "Competition Research";

    presentation_prompt = `Highlight the most important facts for an investor from the following paragraphs. If there are none, say "Nothing". Otherwise always respond in the following format: 
            - Problems to be solved
            - Product and Technology
            - Money raised
            - Team
            - Other important points`;
  } else if (task.toLowerCase() == "market-research") {
    title = "Market Research";
    let industry = search_query.split("industry market")[0];
    presentation_prompt = `What facts about the ${industry} market can an investor learn from the following paragraphs? If there are no facts to learn simply output \"Nothing\"`;
  }

  let message = await execute_search_task(
    title,
    website,
    search_query,
    presentation_prompt,
    openai,
    editor
  );
  return message;
}

async function execute_search_task(
  task: string,
  website: string,
  search_query: string,
  presentation_prompt: string,
  openai: any,
  editor: Editor
) {
  try {
    let website_name = "";
    if (website == "") {
      website_name = "general research";
    } else {
      website_name = website.split(".")[0];
    }

    let message = `#### ${task} through ${website_name}\n`;

    let summaries: string[] = [];
    let sources: string[] = [];

    let query = `site:${website} ${search_query}`;

    let result = await you_research(query);

    let counter = 0;

    let user_prompt = presentation_prompt;

    for (let element of result) {
      let snippets = element["snippets"];
      let title = element["title"];
      let url = element["url"];

      let summary = "";

      //for (let i = 0; i < snippets.length; i+=5){
      let paragraphs = snippets; //.slice(i, i+5) //todo 128k context, maybe do it all in one go. potentially change this?
      paragraphs[0] = "- " + paragraphs[0];
      let string_paragraphs = paragraphs.join("\n\n- ");
      if (string_paragraphs && string_paragraphs.length > 1) {
        const response = await openai.chat.completions.create({
          model: gpt_3_latest, //gpt-4 gpt-3.5-turbo  gpt-4-1106-preview
          messages: [
            {
              role: "system",
              content:
                "Act as an investigative journalist who is obsessed with the truth and accuracy. You always give answers in bullet points.",
            },
            {
              role: "user",
              content: `${user_prompt}` + "\nParagraphs:\n" + string_paragraphs,
            },
          ],
          temperature: 0,
          max_tokens: 1024,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
        });

        summary += response.choices[0].message.content + "\n"; //response.data.choices[0].message.content + '\n'
      }

      //}

      summaries.push(summary);
      let source = `[${title}](${url})`;
      sources.push(source);
      counter++;

      //todo make this variable regarding how many sources we take
      if (counter == 5) {
        break;
      }
    }

    for (let i = 0; i < summaries.length; i++) {
      message += `##### ${sources[i]}\n`;
      message += summaries[i] + "\n\n";
    }

    return message;
  } catch (error) {
    console.log(`Error while doing research: ${error}`);
    new Notice(`Error while doing research`);
  }

  return "";
}

async function you_research(query: string) {
  let results = await request({
    url: `https://you-researcher-container-xm5lmdnsxq-uc.a.run.app/search?query=${query}`,
    method: "GET",
  });
  return await JSON.parse(results)["hits"];
}

export { specific_web_research, you_research };
