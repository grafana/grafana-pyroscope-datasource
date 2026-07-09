package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	pyroscope "github.com/grafana/grafana-pyroscope-datasource/pkg/grafana-pyroscope-datasource"
)

func main() {
	if err := datasource.Manage("grafana-pyroscope-datasource", pyroscope.NewDatasource, datasource.ManageOpts{}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
