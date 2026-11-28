package schema_test

import (
	_ "embed"
	"maps"
	"testing"

	"github.com/grafana/dsconfig/schema"
	"github.com/grafana/grafana-plugin-sdk-go/experimental/pluginschema"
	"k8s.io/kube-openapi/pkg/spec3"
)

//go:embed dsconfig.json
var configSchemaJSON []byte

type settings struct {
	MinStep                   string   `json:"minStep"`
	OAuthPassThru             bool     `json:"oauthPassThru"`
	TLSAuth                   bool     `json:"tlsAuth"`
	TLSAuthWithCACert         bool     `json:"tlsAuthWithCACert"`
	TLSSkipVerify             bool     `json:"tlsSkipVerify"`
	ServerName                string   `json:"serverName"`
	KeepCookies               []string `json:"keepCookies"`
	Timeout                   int      `json:"timeout"`
	EnableSecureSocksProxy    bool     `json:"enableSecureSocksProxy"`
	SecureSocksProxyUsername  string   `json:"secureSocksProxyUsername"`
	KeepAlive                 int      `json:"keepAlive"`
	DialTimeout               int      `json:"dialTimeout"`
	HTTPKeepAlive             int      `json:"httpKeepAlive"`
	HTTPTLSHandshakeTimeout   int      `json:"httpTLSHandshakeTimeout"`
	HTTPExpectContinueTimeout int      `json:"httpExpectContinueTimeout"`
	HTTPMaxConnsPerHost       int      `json:"httpMaxConnsPerHost"`
	HTTPMaxIdleConns          int      `json:"httpMaxIdleConns"`
	HTTPMaxIdleConnsPerHost   int      `json:"httpMaxIdleConnsPerHost"`
	HTTPIdleConnTimeout       int      `json:"httpIdleConnTimeout"`
}

//go:generate go test -run TestPlugin -generateArtifacts
func TestPlugin(t *testing.T) {
	const localURL = "http://localhost:4040"
	const tlsURL = "https://pyroscope.example.com"
	schema.RunPluginTests(t, schema.PluginUnderTest{
		ID:                "grafana-pyroscope-datasource",
		ConfigSchemaJSON:  configSchemaJSON,
		SettingsJSONModel: settings{},
		SecureKeys: []string{
			"basicAuthPassword", "password", "tlsCACert", "tlsClientCert", "tlsClientKey", "secureSocksProxyPassword",
		},
		SettingsExamples: &pluginschema.SettingsExamples{Examples: map[string]*spec3.Example{
			"": example("Local Pyroscope without authentication", localURL, nil, map[string]any{"minStep": "15s"}, nil),
			"cloud": example("Grafana Cloud Profiles with HTTP Basic authentication", "https://example.grafana.net",
				map[string]any{"basicAuth": true, "basicAuthUser": "<INSTANCE_ID>"},
				map[string]any{"minStep": "15s"}, map[string]string{"basicAuthPassword": "<ACCESS_POLICY_TOKEN>"}),
			"oauth":     example("Forward the current user's OAuth identity", tlsURL, nil, map[string]any{"oauthPassThru": true, "keepCookies": []string{"profile_session"}}, nil),
			"privateCA": example("Verify a privately signed server certificate", tlsURL, nil, map[string]any{"tlsAuthWithCACert": true}, map[string]string{"tlsCACert": "<CA_CERTIFICATE_PEM>"}),
			"mutualTLS": example("Mutual TLS with a private CA", tlsURL, nil,
				map[string]any{"tlsAuth": true, "tlsAuthWithCACert": true, "serverName": "pyroscope.example.com"},
				map[string]string{"tlsCACert": "<CA_CERTIFICATE_PEM>", "tlsClientCert": "<CLIENT_CERTIFICATE_PEM>", "tlsClientKey": "<CLIENT_PRIVATE_KEY_PEM>"}),
			"skipTLSVerify": example("Skip certificate verification on an isolated test server", tlsURL, nil, map[string]any{"tlsSkipVerify": true}, nil),
			"headers": example("Bearer authentication and tenant headers", tlsURL, nil,
				map[string]any{"httpHeaderName1": "Authorization", "httpHeaderName2": "X-Scope-OrgID"},
				map[string]string{"httpHeaderValue1": "Bearer <TOKEN>", "httpHeaderValue2": "<TENANT_ID>"}),
			"pdc": example("Grafana Cloud Private Data Source Connect", tlsURL, nil,
				map[string]any{"enableSecureSocksProxy": true, "secureSocksProxyUsername": "<PRIVATE_NETWORK_ID>"}, nil),
			"proxyAuth": example("Self-managed SOCKS proxy with credentials", tlsURL, nil,
				map[string]any{"enableSecureSocksProxy": true, "secureSocksProxyUsername": "<PROXY_USER>"},
				map[string]string{"secureSocksProxyPassword": "<PROXY_PASSWORD>"}),
		}},
	})
}

func example(summary, url string, root, jsonData map[string]any, secrets map[string]string) *spec3.Example {
	spec := map[string]any{"title": "Grafana Pyroscope", "url": url, "access": "proxy", "jsonData": jsonData}
	maps.Copy(spec, root)
	value := map[string]any{
		"apiVersion": "grafana-pyroscope-datasource.datasource.grafana.app/v0alpha1",
		"kind":       "DataSource",
		"metadata":   map[string]string{"name": "pyroscope"},
		"spec":       spec,
	}
	if len(secrets) > 0 {
		secure := make(map[string]map[string]string, len(secrets))
		for key, placeholder := range secrets {
			secure[key] = map[string]string{"create": placeholder}
		}
		value["secure"] = secure
	}
	return &spec3.Example{ExampleProps: spec3.ExampleProps{Summary: summary, Value: value}}
}
