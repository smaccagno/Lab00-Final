public with sharing class PagamentiController {

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getPagamenti(String year, String programId, String stato) {
        List<String> conditions = new List<String>();
        String baseQuery = 'SELECT Id, Name, Amount__c, Budget__c, Budget__r.Name, Programma__c, Status__c, Anno_di_Pagamento__c, Data_di_Pagamento__c FROM Payment__c';

        if (!String.isBlank(year)) {
            conditions.add('Anno_di_Pagamento__c = :year');
        }

        if (!String.isBlank(programId)) {
            String shortProgramId = programId.length() > 15 ? programId.substring(0, 15) : programId;
            conditions.add('Programma__c = :shortProgramId');
        }

        if (!String.isBlank(stato) && stato != 'all') {
            conditions.add('Status__c = :stato');
        }

        String whereClause = conditions.isEmpty() ? '' : ' WHERE ' + String.join(conditions, ' AND ');
        // Ordina dal più recente al più vecchio: prima per Data_di_Pagamento__c (i null alla fine), poi per CreatedDate
        String orderClause = ' ORDER BY Data_di_Pagamento__c DESC NULLS LAST, CreatedDate DESC';
        String fullQuery = baseQuery + whereClause + orderClause;

        List<Payment__c> payments = Database.query(fullQuery);
        Decimal totalePagato = 0;

        for (Payment__c p : payments) {
            if (p.Amount__c != null && p.Status__c == 'Pagato') {
                totalePagato += p.Amount__c;
            }
        }

      // Costruiamo anche una versione "resolved" della query per debugging
      String resolvedQuery = fullQuery;
      if (!String.isBlank(year)) {
          resolvedQuery = resolvedQuery.replace(':year', '\'' + year + '\'');
      }
      if (!String.isBlank(programId)) {
          // Il bind usato nella query è :shortProgramId
          resolvedQuery = resolvedQuery.replace(':shortProgramId', '\'' + (programId.length() > 15 ? programId.substring(0, 15) : programId) + '\'');
      }
      if (!String.isBlank(stato) && stato != 'all') {
          resolvedQuery = resolvedQuery.replace(':stato', '\'' + stato + '\'');
      }

      System.debug('--- QUERY BINDATA: ' + fullQuery);
      System.debug('--- QUERY RISOLTA: ' + resolvedQuery);

      return new Map<String, Object>{
          'records' => payments,
          'totalePagato' => totalePagato,
          'query' => fullQuery,
          'resolvedQuery' => resolvedQuery
      };

    }

    @AuraEnabled(cacheable=true)
    public static List<Program> getAvailablePrograms() {
        return [SELECT Id, Name FROM Program ORDER BY Name];
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getAvailableYears() {
        Set<String> yearSet = new Set<String>();
        for (Payment__c p : [SELECT Anno_di_Pagamento__c FROM Payment__c WHERE Anno_di_Pagamento__c != null]) {
            yearSet.add(p.Anno_di_Pagamento__c);
        }
        List<String> years = new List<String>(yearSet);
        years.sort();
        return years;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getAvailableStatuses() {
        List<String> statuses = new List<String>();
        Schema.DescribeFieldResult fieldResult = Payment__c.Status__c.getDescribe();
        for (Schema.PicklistEntry entry : fieldResult.getPicklistValues()) {
            statuses.add(entry.getValue());
        }
        return statuses;
    }
}