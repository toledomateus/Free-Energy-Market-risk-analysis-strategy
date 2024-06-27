const CONSUMER_TYPE = "EXAMPLE_ID_FOR_CONSUMER_TYPE";
const TRADER_TYPE = "EXAMPLE_ID_FOR_TRADER_TYPE";
const GENERATOR_TYPE = "EXAMPLE_ID_FOR_GENERATOR_TYPE";

let energyBalancing, loadProjection, genProjection;

const minAndMaxDate = com.energy.contrato._search(
  aggsMinAndMaxDate(_pin.portfolio)
);

let dateMax = new Date(minAndMaxDate.aggregations.month_max.value_as_string),
  dateMin = new Date(minAndMaxDate.aggregations.month_min.value_as_string);

const timeline = getPortfolioTimeline(dateMin, dateMax);
const isConsumer = _pin.agentType && _pin.agentType._id === CONSUMER_TYPE
const isGenerator = _pin.agentType && _pin.agentType._id === GENERATOR_TYPE
const isTrader = _pin.agentType && _pin.agentType._id === TRADER_TYPE

if (isConsumer) {
  loadProjection = generateLoadProjection(_pin.load, timeline);
  energyBalancing = generateConsumerEnergyBalance(
    loadProjection,
    _pin.portfolio,
    timeline
  );
}

if (isGenerator) {
  genProjection = com.energy.generation.getProjection(_pin.generation, timeline);
  energyBalancing = generateGeneratorEnergyBalance(
    genProjection,
    _pin.portfolio,
    timeline
  );
}

if (isTrader) {
  energyBalancing = generateTraderEnergyBalance(_pin.portfolio, timeline);
}

/*----------------------------------- Auxiliary functions -----------------------------------*/


function generateGeneratorEnergyBalance(genProjection, portfolio, timeline) {
  let energyBalancing = [],
    result,
    operation

  
  for (let i = 0; i < timeline.length; i++) {
    result = com.energy.contrato._search(
      fromPortfolioGetPeriodAndMWTotal(
        portfolio._id,
        timeline[i],
        i > 0 ? timeline[i - 1] : 0
      )
    );

    //Monta uma lista com o balanço energético
    operation =
      result.aggregations.MWTotalFromPeriod.value -
      genProjection.find((value) => value.period === timeline[i]).genValue *
        result.aggregations.contractPeriod.value;
    energyBalancing.push({
      MWTotalFromPeriod: operation,
      tradindPeriod: timeline[i],
    });

    result = null;
  }
  return energyBalancing.filter((balance) => balance.MWTotalFromPeriod !== 0);
}

function generateConsumerEnergyBalance(loadProjection, portfolio, timeline) {
  let energyBalancing = [],
    result,
    operation;

  //Para cada mês da carteira
  for (let i = 0; i < timeline.length; i++) {
    //busca todos os contratos da carteira conforme o contrato e o período da busca
    result = com.energy.contrato._search(
      fromPortfolioGetPeriodAndMWTotal(
        portfolio._id,
        timeline[i],
        i > 0 ? timeline[i - 1] : 0
      )
    );

    //Do energy balacing list
    operation =
      result.aggregations.MWTotalFromPeriod.value -
      loadProjection.find((value) => value.period === timeline[i]).loadValue *
        result.aggregations.contractPeriod.value;
    energyBalancing.push({
      MWTotalFromPeriod: operation,
      tradindPeriod: timeline[i],
    });

    result = null;
  }
  return energyBalancing.filter((balance) => balance.MWTotalFromPeriod !== 0);
}

function generateTraderEnergyBalance(portfolio, timeline) {
  let energyBalancing = [],
    result;

  //for each wallet's month
  for (let i = 0; i < timeline.length; i++) {
    //search all wallet's contracts acording to the contract and period.
    result = com.energy.contrato._search(
      fromPortfolioGetPeriodAndMWTotal(portfolio._id, timeline[i])
    );

    energyBalancing.push({
      MWTotalFromPeriod: result.aggregations.MWTotalFromPeriod.value,
      tradindPeriod: timeline[i],
    });

    result = null;
  }
  // return the energy balancing only with relevant contracts.
  return energyBalancing.filter((balance) => balance.MWTotalFromPeriod.value > 0);
}

function aggsMinAndMaxDate(portfolio) {
    return {
      size: 0,
      query: {
        bool: {
          must: {
            term: {
              "portfolio._id": portfolio._id,
            },
          },
        },
      },
      aggs: {
        month_min: {
          min: {
            field: "supplyStartDate",
          },
        },
        month_max: {
          max: {
            field: "supplyEndDate",
          },
        },
      },
    };
  }
  
function getPortfolioTimeline(dateMin, dateMax) {
    let timeline = []
  
    const yearMin = dateMin.getFullYear();
    const yearMax = dateMax.getFullYear();
  
    //build timeline
    for (let i = yearMin; i <= yearMax; i++) {
      for (let j = 0; j <= 11; j++) {
        let data = new Date(i, j, 1);
        timeline.push(data);
      }
    }
    return timeline;
}
  
function fromPortfolioGetPeriodAndMWTotal(portfolio, date, dateBefore) {
  if (!dateBefore) {
    dateBefore = 0;
  }

  const DATE_MS = date.getTime();
  const DATEBEF_MS = dateBefore !== 0 ? dateBefore.getTime() : 0;

  const operation_contractPeriod =
    "(((" + (DATE_MS - DATEBEF_MS) + "L)) / (1000*60*60))";
  const operation_MWTotalFromPeriod =
    operation_contractPeriod + " * doc['MWmed'].value";

  return {
    size: 0,
    query: {
      bool: {
        must: [
          {
            term: {
              "portfolio._id": portfolio,
            },
          },
          {
            range: {
              supplyEndDate: {
                gte: date,
              },
            },
          },
          {
            range: {
              supplyStartDate: {
                lte: date,
              },
            },
          },
        ],
      },
    },
    aggs: {
      contract: {
        terms: {
          field: "code.keyword",
          size: 10000,
        },
        aggs: {
          mwmed: {
            max: {
              field: "MWmed",
            },
          },
          sd: {
            max: {
              field: "supplyStartDate",
            },
          },
          ed: {
            max: {
              field: "supplyEndDate",
            },
          },
        },
      },
      MWTotalFromPeriod: {
        sum: {
          script: operation_MWTotalFromPeriod,
        },
      },
      contractPeriod: {
        max: {
          script: operation_contractPeriod,
        },
      },
    },
  };
}
