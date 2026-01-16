public class CityValidation {
    @InvocableMethod
    public static List<String> validateCity(List<String> cityName) {
        List<String> result = new List<String>();
        String apiKey = 'AIzaSyDcKBck74ljNWsH8RR9L86JYneSE26tsik';
        String url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=' + EncodingUtil.urlEncode(cityName[0], 'UTF-8') + '&types=(cities)&key=' + apiKey;

        Http http = new Http();
        HttpRequest request = new HttpRequest();
        request.setEndpoint(url);
        request.setMethod('GET');
        
        HttpResponse response = http.send(request);
        
        if (response.getStatusCode() == 200) {
            Map<String, Object> results = (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
            List<Object> predictions = (List<Object>) results.get('predictions');

            if (predictions != null && !predictions.isEmpty()) {
                result.add('Città valida');
            } else {
                result.add('Città non valida');
            }
        } else {
            result.add('Errore nella chiamata API');
        }
        return result;
    }
}