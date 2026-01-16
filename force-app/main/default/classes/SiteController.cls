/**
 * @description       : Site controller
 * @author            : Seidor
**/
public without sharing class SiteController {
   
    /**
    * @description Get account by structure code
    * @param code : String
    * @return Account 
    **/
    @AuraEnabled
    public static Account getAccountByStructureCode(String code){
        try {
            return [SELECT Id FROM Account WHERE StructureCode__c = :code WITH SYSTEM_MODE LIMIT 1];
        } catch (Exception e) { throw new AuraHandledException(e.getMessage()); }
    }

    /**
    * @description Get tickets
    * @param accountId : Id
    * @return List<TicketAvailability__c> 
    **/
    @AuraEnabled(cacheable=true)
    public static List<TicketAvailability__c> getTickets(Id accountId){
        try {
            return [SELECT Id, Name, Show__r.Name, Show__r.Type__c, Show__r.Datetime__c, StartValidity__c, EndValidity__c, 
                           State__c, TicketType__c, IssuanceType__c, PaymentType__c, Structure__r.Name, PriceFull__c, 
                           PriceDiscounted__c, OfferExpirationDate__c, NumberUses__c, SubscriptionName__c, SubscriptionType__c
                      FROM TicketAvailability__c 
                     WHERE Structure__c = :accountId
                      WITH SYSTEM_MODE
                  ORDER BY CreatedDate DESC];
        } catch (Exception e) { throw new AuraHandledException(e.getMessage()); }
    }

    /**
    * @description Delete ticket
    * @param ticketId : Id
    **/
    @AuraEnabled
    public static void deleteTicket(Id ticketId){
        try {
            TicketAvailability__c ticket = new TicketAvailability__c(Id = ticketId);
            delete as system ticket;
        } catch (Exception e) { throw new AuraHandledException(e.getMessage()); }
    }
}