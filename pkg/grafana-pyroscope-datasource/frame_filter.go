package pyroscope

import (
	typesv1 "github.com/grafana/pyroscope/api/gen/proto/go/types/v1"
	"google.golang.org/protobuf/encoding/protowire"
)

type StackFrameFilter struct {
	IncludeFunctionNames       []string `json:"includeFunctionNames,omitempty"`
	ExcludeFunctionNames       []string `json:"excludeFunctionNames,omitempty"`
	IncludeFunctionNameRegexes []string `json:"includeFunctionNameRegexes,omitempty"`
	ExcludeFunctionNameRegexes []string `json:"excludeFunctionNameRegexes,omitempty"`
}

func addFrameFilter(selector *typesv1.StackTraceSelector, filter *StackFrameFilter) *typesv1.StackTraceSelector {
	if filter == nil {
		return selector
	}
	var encoded []byte
	for field, names := range [][]string{
		filter.IncludeFunctionNames,
		filter.ExcludeFunctionNames,
		filter.IncludeFunctionNameRegexes,
		filter.ExcludeFunctionNameRegexes,
	} {
		for _, name := range names {
			encoded = protowire.AppendTag(encoded, protowire.Number(field+1), protowire.BytesType)
			encoded = protowire.AppendString(encoded, name)
		}
	}
	if len(encoded) == 0 {
		return selector
	}
	if selector == nil {
		selector = &typesv1.StackTraceSelector{}
	}
	// The released Pyroscope API module predates frame_filter (field 3).
	// Unknown protobuf fields survive marshaling and reach newer Pyroscope servers.
	unknown := selector.ProtoReflect().GetUnknown()
	unknown = protowire.AppendTag(unknown, 3, protowire.BytesType)
	unknown = protowire.AppendBytes(unknown, encoded)
	selector.ProtoReflect().SetUnknown(unknown)
	return selector
}
