import { App, Modal, Setting, FuzzySuggestModal, TFile} from 'obsidian';
export class TextInputModal extends Modal {
    input: string;
    onsubmit: (input: string) => void;
    type: string;
  
    constructor(app: App, type:string,  onsubmit: (input: string) => void) {
      super(app);
      this.onsubmit = onsubmit;
      this.type = type;
    }

  
    onOpen() {
      const { contentEl } = this;
      let title = ''
      if (this.type == 'market-research'){title = 'What industry do you want to research?'}
      if (this.type == 'defensibility'){title = 'Describe the startup whose defensibility is to be evaluated'}
      if (this.type == 'evaluate'){title = 'Describe the startup to be evaluated'}
      if (this.type == 'url-research'){title = 'Enter url to investigate'}
      if (this.type == 'fireflies-summary') {title = 'Insert the name of the fireflies recording/meeting you would like to summarize'}
      if(this.type == 'competition'){title = 'Describe the startup or industry for competition research'}
      contentEl.createEl('h2', { text: title });



      
  
      const inputEl = contentEl.createEl('textarea');







      inputEl.addEventListener('input', (event) => {
        event.stopPropagation();
      });
  
      const submitButton = contentEl.createEl('button', { text: 'Submit' });
      submitButton.style.position = 'absolute';
      submitButton.style.bottom = '0';
      submitButton.style.right = '0'
      
      submitButton.addEventListener('click', () => {
        this.onsubmit(inputEl.value); //inputEl.value
        this.close();
      });
    
    }
    onClose() {
        let { contentEl } = this;
        contentEl.empty();
      }
}

export class MultipleTextInputModal extends Modal {
  input: string;
  onsubmit: (input: string) => void;
  type: string;
  query: string;
  website: string;
  task: string;


  constructor(app: App, type:string,  onsubmit: (input: string) => void) {
    super(app);
    this.onsubmit = onsubmit;
    this.type = type;
    }

  onOpen() {
    const { contentEl } = this;
    let title = 'What topic would you like to research today?'
    contentEl.createEl('h2', { text: title });

    let query = new Setting(contentEl).setName("Search Query").addText((text) => text.onChange((value) => {this.query = value}))
    let web = new Setting(contentEl).setName("Website to Search").addText((text) => text.onChange((value) => {this.website = value}))

    new Setting(contentEl).setName("Task to do").addDropdown((menu) => {
      menu.addOption("competition", "Find & Analyze competitors")
      menu.addOption("market-research", "Investor Summary")
      menu.setValue("....")
      menu.onChange((value) => {this.task = value})
    })

    let button = new Setting(contentEl).addButton((btn) => {
      btn.setButtonText("Submit").setCta().onClick(() => {
        this.close();
        this.onsubmit(this.website + ', ' + this.query + ', ' + this.task)

    })})







    
  }

  

}


export class PDFModal extends FuzzySuggestModal<TFile> {

  onsubmit: (input: string) => void;

  constructor(app: App, onsubmit: (input: string) => void) {
    super(app);
    this.onsubmit = onsubmit;
    }


  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file)=> file.extension.includes('pdf'))
    //return ALL_BOOKS;
  }

  getItemText(file: TFile): string {
    return file.name;
  }

  onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
    //new Notice(`Selected ${file.path}`);
    
    //let x = fs.createReadStream(file.path)
    this.onsubmit(file.path)
    
  }
}


