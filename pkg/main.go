package main

import (
	"os"

	pyroscope "github.com/grafana/grafana-pyroscope-datasource/pkg/grafana-pyroscope-datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

func main() {
	if err := datasource.Manage("grafana-pyroscope-datasource", pyroscope.NewDatasource, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
