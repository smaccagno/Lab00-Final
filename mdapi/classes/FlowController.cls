/**
 * @description       : Flow Controller
 * @author            : Seidor
**/
public with sharing class FlowController {

    private static final String LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    private static final String DIGITS = '0123456789';

    /**
    * @description Get records
    * @param objectApiName : String
    * @param fields : List<String>  
    * @return List<SObject> 
    **/
    @AuraEnabled(cacheable=true)
    public static List<SObject> getRecords(String objectApiName, List<String> fields){
        try {
            return Database.query('SELECT ' + String.join(fields, ', ') + ' FROM ' + String.escapeSingleQuotes(objectApiName) + ' ORDER BY Name ASC');
        } catch (Exception e) { throw new AuraHandledException(e.getMessage()); }
    }
    
    /**
    * @description Generate Structure code
    * @return String 
    **/
    @InvocableMethod(label='Genera Codice Struttura' description='Genera un codice alfanumerico casuale a 16 caratteri con lettera iniziale e finale')
    public static List<String> generateStructureCode() {
        String code;
        Account account;

        do {
            try {
                code = generateCode();
                account = SiteController.getAccountByStructureCode(code);
            } catch (Exception e) {
                System.debug(e);
            }
        } while (account != null);

        return new List<String>{ code };
    }

    /**
    * @description Generate code
    * @return String 
    **/
    private static String generateCode(){
        List<String> chars = new List<String>();

        for (Integer i = 0; i < 6; i++) { chars.add(randomChar(LETTERS)); }
        for (Integer i = 0; i < 8; i++) { chars.add(randomChar(DIGITS)); }

        for (Integer i = chars.size() - 1; i > 0; i--) {
            Integer j = Math.mod(Math.abs(Crypto.getRandomInteger()), i + 1);
            String temp = chars[i];
            chars[i] = chars[j];
            chars[j] = temp;
        }

        return randomChar(LETTERS) + String.join(chars, '') + randomChar(LETTERS);
    }

    /**
    * @description Rendom char
    * @param source : String
    * @return String 
    **/
    private static String randomChar(String source) {
        Integer index = Math.mod(Math.abs(Crypto.getRandomInteger()), source.length());
        return String.fromCharArray(new Integer[]{source.charAt(index)});
    }
}