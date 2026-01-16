public class InvoiceUtil {
  @InvocableMethod
  public static List<List<String>> convertStringToIdList(
    List<String> inputStrings
  ) {
    List<List<String>> result = new List<List<String>>();

    // Itera su ogni stringa passata nella lista di input
    for (String inputString : inputStrings) {
      List<String> stringIds = inputString.split(','); // Split dei valori separati da virgola

      // Pulisce e aggiunge ogni ID alla lista risultante
      List<String> cleanedIds = new List<String>();
      for (String id : stringIds) {
        cleanedIds.add(id.trim()); // Rimuove gli spazi extra
      }

      result.add(cleanedIds);
    }

    return result; // Restituisce una lista di liste
  }
}