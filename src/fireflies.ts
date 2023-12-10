export async function get_meeting_id(
  meeting_name: string,
  fireflies_api_key: string
) {
  let meetings = await fetch("https://api.fireflies.ai/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fireflies_api_key}`, //Your authorization token
    },
    body: JSON.stringify({
      query: `
            query {
                transcripts {
                    id
                    title
                    fireflies_users
                    participants
                    date
                    transcript_url
                    duration
                }
            }
        `,
    }),
  })
    .then((result) => {
      return result.json();
    })
    .then((result) => {
      return result.data;
    });

  //console.log(meetings)
  let meetings_list = meetings["transcripts"];
  let meeting_id = "";

  for (let meeting of meetings_list) {
    if (meeting["title"] == meeting_name) {
      meeting_id = meeting["id"];
      break;
    }
  }

  return meeting_id;
}

export async function get_meeting_transcript_by_id(
  id: string,
  investor_names: string[]
) {
  let transcript = await fetch("https://api.fireflies.ai/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer 853462ce-ee32-4aef-b840-ea9883cc38b3", //Your authorization token
    },
    body: JSON.stringify({
      query: `
              query {
                transcript(id: "${id}"){ title date sentences {text speaker_name} }
              }
          `,
    }),
  })
    .then((result) => {
      return result.json();
    })
    .then((result) => {
      return result.data;
    });

  let current_sentence = "";
  let useful_paragraphs: string[] = [];
  let current_speaker =
    transcript["transcript"]["sentences"][0]["speaker_name"];

  for (let sentence of transcript["transcript"]["sentences"]) {
    if (sentence["speaker_name"] == current_speaker) {
      current_sentence += sentence["text"];
    } else {
      if (current_sentence.length != 0) {
        if (investor_names.includes(current_speaker)) {
          current_speaker += " (Investor)";
          console.log(current_speaker);
        } else {
          current_speaker += " (Founder)";
        }
        current_sentence = current_speaker + ": " + current_sentence + "\n";
        useful_paragraphs.push(current_sentence);
        current_sentence = sentence["text"];
        current_speaker = sentence["speaker_name"];
      }
    }
  }
  if (current_sentence.length != 0) {
    useful_paragraphs.push(current_sentence);
  }

  return useful_paragraphs;
}
