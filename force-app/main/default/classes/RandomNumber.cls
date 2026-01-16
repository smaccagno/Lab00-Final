public with sharing class RandomNumber {
    
    @InvocableMethod(label='Genera Codice Casuale' description='Genera un codice numerico casuale')
    public static List<Integer> generaCodiceCasuale(List<Integer> input) {
        List<Integer> codici = new List<Integer>();
        // Ad esempio, genera un numero casuale a 6 cifre (da 0 a 999999)
        Double randomDouble = Math.random();
        Integer codice = (Integer)Math.floor(randomDouble * 1000000000);
        codici.add(codice);
        return codici;
    }
}