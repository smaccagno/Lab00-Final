({
    init : function (component) {
        var flow = component.find("flowData");
        var recordId = component.get("v.recordId");
        flow.startFlow("LAB00_Create_Budget_from_Oppty");
    },
    handleStatusChange : function (component, event) {
        if(event.getParam("status") === "FINISHED") {
           var outputVariables = event.getParam("outputVariables");
           var outputVar;
           for(var i = 0; i < outputVariables.length; i++) {
              outputVar = outputVariables[i];
              if(outputVar.name === "recordIdOutput") {
                 var urlEvent = $A.get("e.force:navigateToSObject");
                 urlEvent.setParams({
                    recordId: outputVar.value,
                    isredirect: true
                 });
                 urlEvent.fire();
              }
           }
        }
    }
})