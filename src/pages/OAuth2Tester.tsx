import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type GrantType = "authorization_code" | "client_credentials";
type Step = "form" | "auth" | "exchange" | "result";

const LS_KEY = "oauth2tester:form";

// CHANGE THIS TO YOUR SUPABASE PROJECT ID IF NEEDED
const SUPABASE_PROJECT_ID = "xziropvhidyvginabopy";
const EDGE_FUNCTION_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/oauth2-proxy`;

const defaultValues = {
  grantType: "authorization_code" as GrantType,
  authUrl: "",
  tokenUrl: "",
  clientId: "",
  clientSecret: "",
  redirectUri: window.location.origin + "/oauth2-callback",
  scope: "",
  extraAuthParams: "",
  extraTokenParams: "",
};

function appendPath(url: string, path: string) {
  if (!url) return path;
  try {
    const u = new URL(url);
    if (u.pathname.endsWith(path)) return url;
    u.pathname = u.pathname.replace(/\/$/, "") + path;
    return u.toString();
  } catch {
    // Not a valid URL, just append
    if (url.endsWith(path)) return url;
    return url.replace(/\/$/, "") + path;
  }
}

export default function OAuth2Tester() {
  const [form, setForm] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        return { ...defaultValues, ...JSON.parse(raw) };
      }
    } catch {}
    return defaultValues;
  });
  const [step, setStep] = useState<Step>("form");
  const [authUrl, setAuthUrl] = useState("");
  const [code, setCode] = useState("");
  const [debug, setDebug] = useState<string[]>([]);
  const [tokenResult, setTokenResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Persist form to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(form));
    } catch {}
  }, [form]);

  // Get Supabase access token
  useEffect(() => {
    let mounted = true;
    async function fetchToken() {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setAccessToken(data.session?.access_token ?? null);
      }
    }
    fetchToken();
    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleGrantTypeChange(value: GrantType) {
    setForm((f) => ({
      ...f,
      grantType: value,
      ...(value === "client_credentials"
        ? { authUrl: "", extraAuthParams: "", redirectUri: window.location.origin + "/oauth2-callback" }
        : {}),
    }));
    setStep("form");
    setCode("");
    setDebug([]);
    setTokenResult(null);
    setError(null);
  }

  function buildAuthUrl() {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: form.clientId,
      redirect_uri: form.redirectUri,
      scope: form.scope,
      ...parseExtra(form.extraAuthParams),
    });
    return `${form.authUrl}?${params.toString()}`;
  }

  function parseExtra(extra: string) {
    const out: Record<string, string> = {};
    extra.split("&").forEach((pair) => {
      const [k, v] = pair.split("=");
      if (k && v) out[k.trim()] = v.trim();
    });
    return out;
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDebug([]);
    if (form.grantType === "authorization_code") {
      const url = buildAuthUrl();
      setAuthUrl(url);
      setDebug([
        `Generated Authorization URL:`,
        url,
        "",
        "1. Click 'Open Auth URL' to start the OAuth2 flow.",
        "2. Authorize the app, then copy the 'code' from the redirect URL and paste it below.",
      ]);
      setStep("auth");
    } else {
      setDebug([
        "Using Client Credentials grant type.",
        "Exchanging client credentials for token via Edge Function...",
        `POST ${form.tokenUrl}`,
      ]);
      handleClientCredentialsExchange();
    }
  }

  async function handleClientCredentialsExchange() {
    try {
      const params = {
        grant_type: "client_credentials",
        client_id: form.clientId,
        client_secret: form.clientSecret,
        scope: form.scope,
        ...parseExtra(form.extraTokenParams),
      };
      setDebug((d) => [
        ...d,
        "Request body (sent to Edge Function):",
        JSON.stringify(params, null, 2),
      ]);
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          tokenUrl: form.tokenUrl,
          params,
        }),
      });
      const json = await res.json();
      setDebug((d) => [
        ...d,
        `Edge Function response status: ${res.status}`,
        "Token endpoint response status: " + json.status,
        "Token endpoint response body:",
        typeof json.data === "string"
          ? json.data
          : JSON.stringify(json.data, null, 2),
      ]);
      setTokenResult(json.data);
      setStep("result");
    } catch (err: any) {
      setError(err.message || "Unknown error");
    }
  }

  async function handleExchange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDebug((d) => [
      ...d,
      "",
      "Exchanging code for token via Edge Function...",
      `POST ${form.tokenUrl}`,
    ]);
    try {
      const params = {
        grant_type: "authorization_code",
        code,
        redirect_uri: form.redirectUri,
        client_id: form.clientId,
        client_secret: form.clientSecret,
        ...parseExtra(form.extraTokenParams),
      };
      setDebug((d) => [
        ...d,
        "Request body (sent to Edge Function):",
        JSON.stringify(params, null, 2),
      ]);
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          tokenUrl: form.tokenUrl,
          params,
        }),
      });
      const json = await res.json();
      setDebug((d) => [
        ...d,
        `Edge Function response status: ${res.status}`,
        "Token endpoint response status: " + json.status,
        "Token endpoint response body:",
        typeof json.data === "string"
          ? json.data
          : JSON.stringify(json.data, null, 2),
      ]);
      setTokenResult(json.data);
      setStep("result");
    } catch (err: any) {
      setError(err.message || "Unknown error");
    }
  }

  function reset() {
    setForm(defaultValues);
    setStep("form");
    setAuthUrl("");
    setCode("");
    setDebug([]);
    setTokenResult(null);
    setError(null);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  }

  function handleAppendAuthPath() {
    setForm((f) => ({
      ...f,
      authUrl: appendPath(f.authUrl, "/oauth2/authorize"),
    }));
  }

  function handleAppendTokenPath() {
    setForm((f) => ({
      ...f,
      tokenUrl: appendPath(f.tokenUrl, "/oauth2/token"),
    }));
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader>
          <CardTitle>OAuth2 Tester</CardTitle>
        </CardHeader>
        <CardContent>
          {!accessToken && (
            <div className="mb-4 text-red-600">
              You must be logged in to use this tool.
            </div>
          )}
          <form className="space-y-4" onSubmit={handleFormSubmit}>
            <div>
              <Label>Grant Type</Label>
              <Select value={form.grantType} onValueChange={handleGrantTypeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="authorization_code">Authorization Code</SelectItem>
                  <SelectItem value="client_credentials">Client Credentials</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.grantType === "authorization_code" && (
              <div>
                <Label>Authorization URL</Label>
                <div className="flex gap-2">
                  <Input
                    name="authUrl"
                    value={form.authUrl}
                    onChange={handleChange}
                    placeholder="https://provider.com/oauth2/authorize"
                    required={form.grantType === "authorization_code"}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="whitespace-nowrap"
                    onClick={handleAppendAuthPath}
                  >
                    +/oauth2/authorize
                  </Button>
                </div>
              </div>
            )}
            <div>
              <Label>Token URL</Label>
              <div className="flex gap-2">
                <Input
                  name="tokenUrl"
                  value={form.tokenUrl}
                  onChange={handleChange}
                  placeholder="https://provider.com/oauth2/token"
                  required
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="whitespace-nowrap"
                  onClick={handleAppendTokenPath}
                >
                  +/oauth2/token
                </Button>
              </div>
            </div>
            <div>
              <Label>Client ID</Label>
              <Input
                name="clientId"
                value={form.clientId}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <Label>Client Secret</Label>
              <Input
                name="clientSecret"
                value={form.clientSecret}
                onChange={handleChange}
                type="password"
              />
            </div>
            {form.grantType === "authorization_code" && (
              <div>
                <Label>Redirect URI</Label>
                <Input
                  name="redirectUri"
                  value={form.redirectUri}
                  onChange={handleChange}
                  required
                />
              </div>
            )}
            <div>
              <Label>Scope</Label>
              <Input
                name="scope"
                value={form.scope}
                onChange={handleChange}
                placeholder="e.g. openid email profile"
              />
            </div>
            {form.grantType === "authorization_code" && (
              <div>
                <Label>Extra Auth Params</Label>
                <Input
                  name="extraAuthParams"
                  value={form.extraAuthParams}
                  onChange={handleChange}
                  placeholder="key1=val1&key2=val2"
                />
              </div>
            )}
            <div>
              <Label>Extra Token Params</Label>
              <Input
                name="extraTokenParams"
                value={form.extraTokenParams}
                onChange={handleChange}
                placeholder="key1=val1&key2=val2"
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={!accessToken}>
              {form.grantType === "authorization_code"
                ? "Start OAuth2 Flow"
                : "Request Token"}
            </Button>
          </form>

          {form.grantType === "authorization_code" && step === "auth" && (
            <div className="space-y-4 mt-6">
              <Button
                className="w-full"
                onClick={() => window.open(authUrl, "_blank")}
              >
                Open Auth URL
              </Button>
              <div>
                <Label>
                  After authorizing, paste the <span className="font-mono">code</span> from the redirect URL here:
                </Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste code here"
                  className="mt-1"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleExchange}
                disabled={!code || !accessToken}
              >
                Exchange Code for Token
              </Button>
            </div>
          )}

          {step === "result" && (
            <div className="space-y-4 mt-6">
              <div>
                <Label>Token Response</Label>
                <Textarea
                  value={JSON.stringify(tokenResult, null, 2)}
                  readOnly
                  rows={8}
                  className="font-mono"
                />
              </div>
              <Button className="w-full" onClick={reset}>
                Start Over
              </Button>
            </div>
          )}

          <div className="mt-6">
            <Label>Debug Output</Label>
            <Textarea
              value={debug.join("\n")}
              readOnly
              rows={10}
              className="font-mono text-xs"
            />
            {error && (
              <div className="text-red-600 mt-2">{error}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}