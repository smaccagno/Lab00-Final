import { LightningElement } from "lwc";
import startAlignment from "@salesforce/apex/ProgramAlignmentConsoleService.startAlignment";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

export default class AlignAllProgramsOnConsoleLoad extends LightningElement {
  connectedCallback() {
    startAlignment()
      .then(() => {
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Allineamento avviato",
            message: "Aggiornamento dei Programmi in background.",
            variant: "success"
          })
        );
      })
      .catch((error) => {
        /* log + toast di errore */
        // eslint-disable-next-line no-console
        console.error("Errore allineamento", error);
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Errore",
            message: error.body?.message ?? error.message,
            variant: "error"
          })
        );
      });
  }
}