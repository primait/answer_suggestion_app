(function() {
  function TicketSerializer(ticket){
    this.ticket = ticket;

    this.toSearchQuery = function(){
      return "";
    };
  }

  function ResultSerializer(result, baseUrl){
    this.result = result;
    this.baseUrl = baseUrl;

    this.toList = function(){
      return _.reduce(this.result, function(memo, item){
        memo.push({
          id: item.id,
          url: this.baseUrl + "entries/" + item.id,
          title: item.title
        });
        return memo;
      }, [], this);
    };
  }

  return {
    doneLoading: false,

    events: {
      // APP EVENTS
      'app.activated'           : 'initializeIfReady',
      'ticket.status.changed'   : 'initializeIfReady',
      // AJAX EVENTS
      'search.done'             : 'searchDone',
      // DOM EVENTS
      'dragend ul.entries li'   : function(event){
        event.preventDefault();

        return this.appendLinkToComment(this.$(event.currentTarget).data('url'));
      }
    },

    requests: {
      search: function(query){
        return {
          url: '/api/v2/search.json?query=type:topic ' + query,
          type: 'GET'
        };
      }
    },

    initializeIfReady: function(data){
      if (data.firstLoad &&
          this.canInitialize()){

        this.initialize();
        this.doneLoading = true;
      }
    },

    canInitialize: function(){
      return (!this.doneLoading &&
              this.ticket() &&
              this.ticket().id());
    },

    initialize: function(){
      return this.ajax('search', new TicketSerializer(this.ticket()).toSearchQuery());
    },

    searchDone: function(data) {
      return this.switchTo('list', {
        results: new ResultSerializer(data.results, this.baseUrl()).toList()
      });
    },

    baseUrl: function(){
      return "https://" + this.currentAccount().subdomain() + ".zendesk.com/";
    },

    appendLinkToComment: function(url){
      return this.comment().text(this.comment().text() + '\n' + url);
    }
  };

}());
