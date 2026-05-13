package pyroscope

import (
	"context"
	"fmt"
	"runtime"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
)

var logger = backend.NewLoggerWith("logger", "tsdb.pyroscope")

// Return the file, line, and (full-path) function name of the caller
func getRunContext() (string, int, string) {
	pc := make([]uintptr, 10)
	runtime.Callers(2, pc)
	f := runtime.FuncForPC(pc[0])
	file, line := f.FileLine(pc[0])
	return file, line, f.Name()
}

// Return a formatted string representing the execution context for the logger
func logEntrypoint() string {
	file, line, pathToFunction := getRunContext()
	parts := strings.Split(pathToFunction, "/")
	functionName := parts[len(parts)-1]
	return fmt.Sprintf("%s:%d[%s]", file, line, functionName)
}

// NewDatasource creates a new datasource instance for use with datasource.Manage.
func NewDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	return NewPyroscopeDatasource(ctx, *httpclient.NewProvider(), settings)
}
