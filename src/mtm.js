const BBCE_FOWARD_CURVE = "EXAMPLE_ID_FOWARD_CURVE";

const energyBalancing = JSON.parse(_pin.energyBalancing);

const getLastProjection = com.energy.projection._search(fromFowardCurve()).hits
  .hits[0]._source._id;

const dataFowardCurve =
  com.energy.dataFowardCurve._search(fromProjection(getLastProjection))
    .aggregations.data.buckets || []
    .map((data) => ({
        period: data.period.value_as_string,
        price: data.price.value,
  }));
  
generateMtM(_pin.portfolio, energyBalancing, dataFowardCurve);

/*---------------------------- Auxiliary functions ----------------------------*/

function generateMtM(portfolio, energyBalancing, fowardCurveData) {
  let mtm = [],
    mtmJSON,
    dtFromEnergy,
    dtFromFoward;

  for (let i = 0; i < fowardCurveData.length; i++) {
    for (let j = 0; j < energyBalancing.length; j++) {
      dtFromEnergy = new Date(energyBalancing[j].tradindPeriod);
      dtFromFoward = new Date(fowardCurveData[i].period);

      if (dtFromEnergy.getTime() === dtFromFoward.getTime()) {
        mtmJSON = {
          period: dtFromEnergy,
          MtM: energyBalancing[j].MWTotalFromPeriod * fowardCurveData[i].price,
          portfolio: portfolio,
        };

        mtm.push(mtmJSON);

        //Cria os objetos da marcação-ao-mercado
        com.energy.dataMtM._create(mtmJSON);
      }
    }
  }
  return mtm;
}

function fromProjection(getLastProjection) {
  return {
    size: 0,
    query: {
      bool: {
        must: [
          {
            term: {
              "projection._id": getLastProjection,
            },
          },
        ],
      },
    },
    aggs: {
      data: {
        terms: {
          field: "period",
          size: 10000,
        },
        aggs: {
          period: {
            max: {
              field: "period",
            },
          },
          price: {
            max: {
              field: "value",
            },
          },
        },
      },
    },
  };
}

function fromFowardCurve() {
  return {
    size: 1,
    query: {
      bool: {
        must: [
          {
            term: {
              "projectionType._id": BBCE_FOWARD_CURVE,
            },
          },
        ],
      },
    },
    sort: [
      {
        dateProjection: { order: "desc" },
      },
    ],
  };
}
