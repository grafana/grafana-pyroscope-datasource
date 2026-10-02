package pyroscope

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestQueryModelFrameFilter(t *testing.T) {
	var query queryModel
	err := json.Unmarshal([]byte(`{"profileTypeId":"process_cpu:cpu:nanoseconds:cpu:nanoseconds","labelSelector":"{}","frameFilter":{"includeFunctionNames":["main.work"],"excludeFunctionNameRegexes":["sleep$"]}}`), &query)
	require.NoError(t, err)
	require.Equal(t, "process_cpu:cpu:nanoseconds:cpu:nanoseconds", query.ProfileTypeId)
	require.Equal(t, []string{"main.work"}, query.FrameFilter.IncludeFunctionNames)
	require.Equal(t, []string{"sleep$"}, query.FrameFilter.ExcludeFunctionNameRegexes)
}
