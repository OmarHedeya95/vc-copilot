import { request, Notice } from "obsidian";

let url_affinity_organizations = "https://api.affinity.co/organizations";
let url_affinity_note = "https://api.affinity.co/notes";
let url_affinity_persons = "https://api.affinity.co/persons";
let url_affinity_field_values = "https://api.affinity.co/field-values";
let url_affinity_list = "https://api.affinity.co/lists";

function affinity_authorization(affinityAPIKey: string) {
  let username = "";
  let pwd = affinityAPIKey;
  let auth = "Basic " + Buffer.from(username + ":" + pwd).toString("base64");
  let headers = { Authorization: auth, "Content-Type": "application/json" };
  return headers;
}

export async function add_notes_to_company(
  startup: any,
  note: string,
  affinityAPIKey: string
) {
  let headers = affinity_authorization(affinityAPIKey);
  //headers['Content-Type'] = 'application/json'
  let organization_ids = [startup["id"]];
  console.log(organization_ids);
  console.log(note);
  let note_data = { organization_ids: [startup["id"]], content: note };
  let r: any = await request({
    url: url_affinity_note,
    method: "POST",
    headers: headers,
    body: JSON.stringify(note_data),
  })
    .then((data) => console.log(data))
    .catch((error) => {
      console.error(error);
      if (error) {
        return null;
      }
    });
  return "Success";
  //console.log(r)
}

export async function get_startup_by_name(
  affinityAPIKey: string,
  owner_value: string,
  startup_name: string
) {
  //let params = new URLSearchParams ({term: 'Blobr', with_interaction_dates:'true', with_interaction_persons:'true', page_token: ''})

  //let company_name = 'Blobr'
  let subnames = startup_name.split(" ");
  let search_term = subnames[0];
  if (subnames.length > 1) {
    for (let name of subnames.slice(1)) {
      search_term = search_term + "+" + name;
    }
  }
  console.log(search_term);

  let next_page_token = null;
  let headers = affinity_authorization(affinityAPIKey);

  while (true) {
    let full_url =
      url_affinity_organizations +
      "?term=" +
      search_term +
      "&with_interaction_dates=true&with_interaction_persons=true";
    if (next_page_token != null) {
      full_url += "&page_token=" + next_page_token;
    }

    let r: any = await request({
      url: full_url,
      method: "GET",
      headers: headers,
    });

    let response = JSON.parse(r);
    //console.log(response)
    let organizations = response["organizations"];
    next_page_token = response["next_page_token"];
    for (let organization of organizations) {
      if (organization["interactions"]) {
        //console.log(organization)
        for (let [interaction_name, interaction_data] of Object.entries(
          organization["interactions"]
        )) {
          if (interaction_data) {
            let people_involved: any =
              interaction_data["person_ids"].toString();
            if (people_involved.includes(owner_value)) {
              return organization;
            }
          } else {
            break;
          }
        }
      }
    }
    //console.log(next_page_token)
    if (next_page_token == null) {
      return null;
    }
  }
}

export async function get_person_by_name(
  affinityAPIKey: string,
  person_name: string
) {
  let names = person_name.split(" ");
  if (names.length > 1) {
    let next_page_token = null;
    let headers = affinity_authorization(affinityAPIKey);
    let first_name = names[0];
    let last_name = names[1];
    while (true) {
      let full_url = url_affinity_persons + "?term=" + last_name;
      if (next_page_token != null) {
        full_url += "&page_token=" + next_page_token;
      }
      let r: any = await request({
        url: full_url,
        method: "GET",
        headers: headers,
      });

      let response = JSON.parse(r);
      let people = response["persons"];
      next_page_token = response["next_page_token"];

      for (let person of people) {
        if (
          person["first_name"] == first_name &&
          person["last_name"] == last_name
        ) {
          return person;
        }
      }

      if (next_page_token == null) {
        break;
      }
    }
    return null;
  } else {
    //We only have first name, we can not find a person like this
    return null;
  }
  return null;
}

export async function get_person_details(
  affinityAPIKey: string,
  person_id: number
) {
  let full_url = url_affinity_persons + "/" + person_id.toString();
  let headers = affinity_authorization(affinityAPIKey);

  let r: any = await request({
    url: full_url,
    method: "GET",
    headers: headers,
  });
  let response = JSON.parse(r);

  return response;
}

export async function is_person_in_venture_network(
  affinityAPIKey: string,
  person_details: any,
  venture_network_list_id: string
) {
  let list_entries = person_details["list_entries"];
  for (let entry of list_entries) {
    if (entry["list_id"].toString() == venture_network_list_id.toString()) {
      return entry["id"];
    }
  }
  return null;
}

export async function get_field_values(
  affinityAPIKey: string,
  type_id: string,
  id: string
) {
  let full_url = url_affinity_field_values + "?" + type_id + "=" + id;
  let headers = affinity_authorization(affinityAPIKey);
  let r: any = await request({
    url: full_url,
    method: "GET",
    headers: headers,
  });
  let response = JSON.parse(r);

  return response;
}

export async function add_entry_to_list(
  affinityAPIKey: string,
  list_id: string,
  entity_id: number
) {
  let headers = affinity_authorization(affinityAPIKey);
  let full_url = url_affinity_list + "/" + list_id + "/list-entries";
  let data = { entity_id: entity_id };

  let r: any = await request({
    url: full_url,
    method: "POST",
    headers: headers,
    body: JSON.stringify(data),
  })
    .then((data) => console.log(data))
    .catch((error) => {
      console.error(error);
      if (error) {
        return null;
      }
    });

  return "Success";
}
export async function add_field_value(
  affinityAPIKey: string,
  field_id: any,
  entity_id: number,
  value: any,
  list_entry_id: any
) {
  let headers = affinity_authorization(affinityAPIKey);
  let full_url = url_affinity_field_values;
  let data = {
    field_id: field_id,
    entity_id: entity_id,
    value: value,
    list_entry_id: list_entry_id,
  };

  let r: any = await request({
    url: full_url,
    method: "POST",
    headers: headers,
    body: JSON.stringify(data),
  })
    .then((data) => console.log(data))
    .catch((error) => {
      console.error(error);
      if (error) {
        return null;
      }
    });

  return "Success";
}

export async function add_notes_to_person(
  affinityAPIKey: string,
  person_id: any,
  notes: string
) {
  let full_url = url_affinity_note;
  let headers = affinity_authorization(affinityAPIKey);
  let data = { person_ids: [person_id], content: notes };

  let r: any = await request({
    url: full_url,
    method: "POST",
    headers: headers,
    body: JSON.stringify(data),
  })
    .then((data) => console.log(data))
    .catch((error) => {
      console.error(error);
      if (error) {
        return null;
      }
    });

  return "Success";
}

export function startup_ready_for_affinity(file_content: string) {
  return (
    file_content.includes("#startups/screened") &&
    file_content.includes("#Affinity")
  );
}

export function extract_title_and_note(text: string) {
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
  let title = "";
  if (matches) {
    title = matches[0];
  }
  let substrings = text.split(pattern);
  console.log(`Title: ${title}`);
  console.log(substrings);

  return [title, substrings];
}

export function clean_text(startup_name: string) {
  startup_name = startup_name.replace(/[^A-Za-z0-9\s.]/g, "");
  startup_name = startup_name.trim();
  return startup_name;
}

export function is_summarizable(file_content: string) {
  /**
   * Return true if the VC is to be summarized (I am connected with them and they are not already summarized)
   */
  return (
    file_content.includes("#network/connected") &&
    (file_content.includes("#Entity/VC") ||
      file_content.includes("#Person/VC")) &&
    file_content.includes("#gpt_summarized") != true &&
    file_content.includes("dataview") != true
  );
}

export function vc_ready_for_affinity(file_content: string) {
  return (
    file_content.includes("#gpt_summarized") &&
    file_content.includes("#Affinity")
  );
}

export function countWords(str: string) {
  // split the string by word boundaries
  let words = str.match(/\b[a-z\d]+\b/gi);
  // return the length of the array or zero if no match
  return words ? words.length : 0;
}
