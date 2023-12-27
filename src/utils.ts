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

export function extract_startup_details(startup: any) {
  let startup_details = {};
  startup_details["name"] = startup["name"];
  startup_details["domain"] = startup["domain"];
  try {
    startup_details["description"] = startup["description"]["long"];
  } catch (e) {
    startup_details["description"] = startup["description"]["short"];
  }
  startup_details["totalMoneyRaised"] = startup["totalMoneyRaised"];
  startup_details["foundedYear"] = startup["foundedYear"];
  startup_details["location"] = startup["location"];
  startup_details["stage"] = startup["stage"];
  startup_details["investorList"] = startup["investorList"];
  startup_details["profileLinks"] = startup["profileLinks"];
  startup_details["newsInfo"] = startup["newsInfo"];

  startup_details["metrics"] = startup["metrics"];
  startup_details["tracxnTeamScore"] = startup["tracxnTeamScore"];
  startup_details["tracxnScore"] = startup["tracxnScore"];
  return startup_details;
}

export function get_acquisition_details(startup: any) {
  let acquirersString = "";
  let acquirers = startup["acquirerInfo"]["acquirerList"][0]["acquirers"];
  let acquisitionYear =
    startup["acquirerInfo"]["acquirerList"][0]["date"]["year"];
  let counter = 0;
  for (let acquirer of acquirers) {
    if (counter == 0) {
      acquirersString += `[${acquirer["name"]}](${acquirer["domain"]})`;
    } else {
      acquirersString += ", " + `[${acquirer["name"]}](${acquirer["domain"]})`;
    }
    counter += 1;
  }
  return { Acquirers: acquirersString, AcquisitionYear: acquisitionYear };
}

export function get_ipo_details(startup: any) {
  let result = {};
  let ipoList = startup["ipoInfo"]["ipoList"];
  for (let ipo of ipoList) {
    if (ipo["marketCap"]) {
      result["marketCap"] = ipo["marketCap"];
      result["ipoYear"] = ipo["date"]["year"];
      result["stockExchange"] = ipo["stockExchange"];
      result["stockSymbol"] = ipo["stockSymbol"];
    }
  }
  return result;
}

function get_keys_for_table(allKeys) {
  const excludedKeys = ["newsInfo", "metrics", "domain"];
  let finalKeys: any = [];
  for (let key of allKeys) {
    if (!excludedKeys.includes(key)) {
      finalKeys.push(key);
    }
  }
  return finalKeys;
}

function formatNumber(number) {
  const abbreviations = {
    T: 1000000000000,
    B: 1000000000,
    M: 1000000,
    K: 1000,
  };

  for (const abbreviation in abbreviations) {
    if (number >= abbreviations[abbreviation]) {
      const roundedNumber = Math.ceil(number / abbreviations[abbreviation]);
      return roundedNumber + abbreviation;
    }
  }

  return number.toString();
}

function formattedCountryName(countryName) {
  const formattedCountryName =
    countryName.charAt(0).toUpperCase() + countryName.slice(1).toLowerCase();
  return formattedCountryName;
}

function isCountryInEurope(countryName) {
  const europeanCountries = [
    "Albania",
    "Andorra",
    "Austria",
    "Belarus",
    "Belgium",
    "Bosnia and Herzegovina",
    "Bulgaria",
    "Croatia",
    "Cyprus",
    "Czech Republic",
    "Denmark",
    "Estonia",
    "Finland",
    "France",
    "Germany",
    "Greece",
    "Hungary",
    "Iceland",
    "Ireland",
    "Italy",
    "Kosovo",
    "Latvia",
    "Liechtenstein",
    "Lithuania",
    "Luxembourg",
    "Malta",
    "Moldova",
    "Monaco",
    "Montenegro",
    "Netherlands",
    "North Macedonia",
    "Norway",
    "Poland",
    "Portugal",
    "Romania",
    "Russia",
    "San Marino",
    "Serbia",
    "Slovakia",
    "Slovenia",
    "Spain",
    "Sweden",
    "Switzerland",
    "Ukraine",
    "United Kingdom",
    "UK",
    "Vatican City",
  ];

  return europeanCountries.includes(formattedCountryName(countryName));
}

function isCountryInEasternEurope(countryName) {
  const easternEuropeanCountries = [
    "Albania",
    "Belarus",
    "Bosnia and Herzegovina",
    "Bulgaria",
    "Croatia",
    "Cyprus",
    "Czech Republic",
    "Estonia",
    "Hungary",
    "Kosovo",
    "Latvia",
    "Lithuania",
    "Moldova",
    "Montenegro",
    "North Macedonia",
    "Poland",
    "Romania",
    "Russia",
    "Serbia",
    "Slovakia",
    "Slovenia",
    "Ukraine",
  ];

  return easternEuropeanCountries.includes(formattedCountryName(countryName));
}

function isCountryInNordics(countryName) {
  const nordicCountries = ["Denmark", "Finland", "Iceland", "Norway", "Sweden"];

  return nordicCountries.includes(formattedCountryName(countryName));
}

function geo_check(input_country, investor_geo) {
  input_country = input_country.toLowerCase();
  let usa_abbreviations = [
    "usa",
    "us",
    "united states",
    "america",
    "united states of america",
  ];
  if (
    investor_geo.some((geo) => geo.includes("globally")) ||
    investor_geo.some((geo) => geo.includes("agnostic"))
  ) {
    return true;
  }
  if (investor_geo.some((geo) => geo.includes(input_country))) {
    return true;
  }
  if (
    isCountryInEurope(input_country) &&
    (investor_geo.some((geo) => geo.includes("europe")) ||
      investor_geo.some((geo) => geo.includes("eu")))
  ) {
    return true;
  }
  if (
    isCountryInEasternEurope(input_country) &&
    investor_geo.some((geo) => geo.includes("eastern europe"))
  ) {
    return true;
  }
  if (
    isCountryInNordics(input_country) &&
    investor_geo.some((geo) => geo.includes("nordics"))
  ) {
    return true;
  }
  if (usa_abbreviations.includes(input_country)) {
    for (let geo of investor_geo) {
      if (usa_abbreviations.some((abbrev) => geo.includes(abbrev))) {
        return true;
      }
    }
  }

  return false;
}
function stage_check(input_stage, investor_stage) {
  input_stage = input_stage.toLowerCase();
  if (
    investor_stage.some((stage) => stage.includes("pre-seed")) ||
    investor_stage.some((stage) => stage.includes("preseed"))
  ) {
    investor_stage.push("pre-seed");
    investor_stage.push("preseed");
  }
  return investor_stage.some((stage) => stage.includes(input_stage));
}

export function formatObjectsToMarkdownTable(objects, specialFormat) {
  if (objects.length === 0) {
    return "";
  }

  let keys: any = [];
  if (specialFormat) {
    keys = get_keys_for_table(Object.keys(objects[0]));
  } else {
    keys = Object.keys(objects[0]);
  }

  let table = "|";

  // Add column headers
  for (let i = 0; i < keys.length; i++) {
    table += ` ${keys[i]} |`;
  }

  table += "\n|";

  // Add header separator
  for (let i = 0; i < keys.length; i++) {
    table += " --- |";
  }

  // Add rows
  for (let i = 0; i < objects.length; i++) {
    table += "\n|";

    for (let j = 0; j < keys.length; j++) {
      let displayedResult = "";
      try {
        if (keys[j] == "totalMoneyRaised") {
          displayedResult =
            formatNumber(objects[i][keys[j]]["totalAmount"]["amount"]) +
            " " +
            objects[i][keys[j]]["totalAmount"]["currency"];
        } else if (keys[j] == "investorList") {
          let investorListDisplay = "";
          let counter = 0;
          for (let investor of objects[i]["investorList"]) {
            let investorDisplay = `[${investor["name"]}](https://${investor["domain"]})`;
            if (counter == 0) {
              investorListDisplay += investorDisplay;
            } else {
              investorListDisplay += ", " + investorDisplay;
            }
            counter += 1;
          }
          displayedResult = investorListDisplay;
        } else if (keys[j] == "location") {
          displayedResult = objects[i]["location"]["country"];
        } else if (keys[j] == "tracxnTeamScore" || keys[j] == "tracxnScore") {
          displayedResult = Math.ceil(objects[i][keys[j]]).toFixed(0);
        } else if (keys[j] == "profileLinks") {
          let counter = 0;
          for (let [type, link] of Object.entries(objects[i]["profileLinks"])) {
            if (counter == 0) {
              displayedResult += `[${type}](${link})`;
            } else {
              displayedResult += ", " + `[${type}](${link})`;
            }
            counter += 1;
          }
        } else if (keys[j] == "name") {
          let domain = objects[i]["domain"];
          displayedResult = `[${objects[i]["name"]}](https://${domain})`;
        } else if (keys[j] == "marketCap") {
          displayedResult =
            formatNumber(objects[i]["marketCap"]["amount"]) +
            " " +
            objects[i]["marketCap"]["currency"];
        } else {
          displayedResult = objects[i][keys[j]];
        }
      } catch (e) {
        console.error(
          `${objects[i]["name"]} had an error with the key ${keys[j]}`
        );
      }

      table += ` ${displayedResult} |`;
    }
  }

  return table;
}

export function get_relevant_feeds(startupsList: any) {
  let relevant_feeds = {};
  for (let startup of startupsList) {
    let businessModels = startup["businessModelList"];
    for (let businessModel of businessModels) {
      relevant_feeds[businessModel["fullPathString"]] =
        businessModel["companiesInEntireTreeUrl"];
    }
  }
  return relevant_feeds;
}

export function find_eligible_investors(investors, input_country, input_stage) {
  let fit_investors: any = [];
  for (let investor of investors) {
    if (
      geo_check(input_country, investor["geo"]) &&
      stage_check(input_stage, investor["stage"])
    ) {
      fit_investors.push(investor);
    }
  }
  return fit_investors;
}

function extractStage(str) {
  str = str.toLowerCase(); // Convert str to lowercase
  const keywords = [
    "pre-seed",
    "preseed",
    "seed",
    "series a",
    "series b",
    "series c",
    "series d",
  ];
  const regex = new RegExp(keywords.join("|"), "gi");
  const mentions = str.match(regex) || [""];
  return mentions;
}

function extractGeography(str) {
  const regex = /Geography::(.*)/i;
  const match = str.match(regex);
  if (match) {
    let line = match[1].trim();
    let geos = line.split(",");
    let counter = 0;
    for (let geo of geos) {
      geos[counter] = geo.trim().toLowerCase();
      counter += 1;
    }
    return geos;
  }
  return [""];
}

function extractIndustry(str) {
  const regex = /Industry::(.*)/i;
  const match = str.match(regex);
  if (match) {
    let industry = match[1].trim();
    return industry;
  }
  return [""];
}

function extractSpeciality(str) {
  const regex = /Special::?(.*)/i;
  const match = str.match(regex);
  if (match) {
    let industry = match[1].trim();
    return industry;
  }
  return "";
}

function createInvestorObject(name, geographies, stages, industry, speciality) {
  const investorObject = {
    name: name,
    geo: geographies,
    stage: stages,
    industry: industry,
    speciality: speciality,
  };
  return investorObject;
}

export function generate_investor_json(
  investor_name: string,
  investor_text: string
) {
  let name = investor_name;
  let geographies = extractGeography(investor_text);
  let stages = extractStage(investor_text);
  let industry = extractIndustry(investor_text);
  let speciality = extractSpeciality(investor_text);
  return createInvestorObject(name, geographies, stages, industry, speciality);
}

export function extractTextToEndOfLine(
  fullText: string,
  searchString: string
): string {
  const index = fullText.indexOf(searchString);
  if (index !== -1) {
    const endOfLineIndex = fullText.indexOf("\n", index);
    if (endOfLineIndex !== -1) {
      return fullText
        .substring(index + searchString.length, endOfLineIndex)
        .trim();
    } else {
      return fullText.substring(index + searchString.length).trim();
    }
  }
  return "";
}

export function format_matching_prompt(investors, startup_desc) {
  //todo change the prompting to not think about each startup?
  let prompt =
    "You will now get a list of information about some investors. Please read it carefully because you will be asked about it later.\n\n<investor-list>";
  for (let investor of investors) {
    let investor_name = investor["name"];
    let investor_industry = investor["industry"];
    let investor_speciality = investor["speciality"];
    let investor_desc = `\n<investor-info>\n- Name: ${investor_name}\n- Industry: ${investor_industry}\n- Speciality: ${investor_speciality}\n</investor-info>`;
    prompt += investor_desc;
  }
  prompt += "\n</investor-list>";
  prompt +=
    "\n\nNow you will be given some information about a startup. Read it carefully.";

  prompt += `\n\n<startup-info>\n${startup_desc}\n<startup-info>\n\n`;
  prompt += `From the list of investors, choose only suitable investors for the startup.

From the list of investors, choose all suitable investors for the startup.

First you must think deeply about the suitability of each single investor with regard to the startup between the XML tags <thinking> and </thinking>. Then give your final answer as the names of the suitable investors delimited by commas between the XML tags <investors> and </investors>.`;

  return prompt;
}

export function extractResoningText(inputString) {
  const startTag = "<thinking>";
  const endTag = "</thinking>";
  const startIndex = inputString.indexOf(startTag) + startTag.length;
  const endIndex = inputString.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    return ""; // Return an empty string if the tags are not found or in the wrong order
  }

  return inputString.substring(startIndex, endIndex).trim();
}

export function extractInvestorsText(inputString) {
  const startTag = "<investors>";
  const endTag = "</investors>";
  const startIndex = inputString.indexOf(startTag) + startTag.length;
  const endIndex = inputString.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    return ""; // Return an empty string if the tags are not found or in the wrong order
  }

  return inputString.substring(startIndex, endIndex).trim();
}
