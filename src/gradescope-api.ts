import { parse as parseHTML } from "node-html-parser";
import * as fs from "fs/promises";
import * as path from "path";

export class GradescopeAPI {
  private baseUrl = "https://www.gradescope.com";
  private email: string;
  private password: string;
  private cookies: Map<string, string> = new Map();
  private csrfToken: string | null = null;
  private authenticated = false;
  private lastRequestTime = 0;
  private minRequestInterval = 1000; // 1 req/sec

  constructor(email: string, password: string) {
    this.email = email;
    this.password = password;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minRequestInterval - elapsed)
      );
    }
    this.lastRequestTime = Date.now();
  }

  private extractSetCookies(response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    for (const header of setCookieHeaders) {
      const match = header.match(/^([^=]+)=([^;]*)/);
      if (match) {
        this.cookies.set(match[1], match[2]);
      }
    }
  }

  private getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private extractCSRFToken(html: string): string | null {
    const root = parseHTML(html);
    const meta = root.querySelector('meta[name="csrf-token"]');
    if (meta) {
      return meta.getAttribute("content") ?? null;
    }
    // Also check for authenticity_token in hidden inputs
    const input = root.querySelector('input[name="authenticity_token"]');
    if (input) {
      return input.getAttribute("value") ?? null;
    }
    return null;
  }

  private async login(): Promise<void> {
    // Step 1: GET the login page to get CSRF token and initial session cookie
    const loginPageResponse = await fetch(`${this.baseUrl}/login`, {
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    this.extractSetCookies(loginPageResponse);
    const loginHtml = await loginPageResponse.text();
    this.csrfToken = this.extractCSRFToken(loginHtml);

    if (!this.csrfToken) {
      throw new Error(
        "Failed to extract CSRF token from Gradescope login page"
      );
    }

    // Step 2: POST login credentials
    const formBody = new URLSearchParams({
      utf8: "✓",
      authenticity_token: this.csrfToken,
      "session[email]": this.email,
      "session[password]": this.password,
      "session[remember_me]": "1",
      commit: "Log In",
      "session[remember_me_sso]": "0",
    });

    const loginResponse = await fetch(`${this.baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
        Referer: `${this.baseUrl}/login`,
        Origin: this.baseUrl,
      },
      body: formBody.toString(),
    });

    this.extractSetCookies(loginResponse);

    // A successful login redirects (302) to the dashboard
    if (loginResponse.status === 302 || loginResponse.status === 301) {
      const location = loginResponse.headers.get("location");
      if (location && (location.includes("/login") || location.includes("/sessions"))) {
        throw new Error(
          "Gradescope login failed: invalid email or password"
        );
      }
      this.authenticated = true;

      // Follow the redirect to get updated CSRF token
      const redirectUrl = location?.startsWith("http")
        ? location
        : `${this.baseUrl}${location}`;
      const dashResponse = await fetch(redirectUrl, {
        redirect: "manual",
        headers: {
          "User-Agent": "GradescopeMCP/1.0",
          Cookie: this.getCookieHeader(),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      this.extractSetCookies(dashResponse);
      const dashHtml = await dashResponse.text();
      const newToken = this.extractCSRFToken(dashHtml);
      if (newToken) this.csrfToken = newToken;
    } else if (loginResponse.status === 200) {
      // 200 means the login page was re-rendered (failed login)
      const body = await loginResponse.text();
      if (
        body.includes("Invalid email/password") ||
        body.includes("invalid") ||
        body.includes("error")
      ) {
        throw new Error("Gradescope login failed: invalid email or password");
      }
      // Some cases 200 means success with inline redirect
      this.authenticated = true;
    } else {
      throw new Error(
        `Gradescope login failed with status ${loginResponse.status}`
      );
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.authenticated) {
      await this.login();
    }
  }

  private isLoginRedirect(response: Response): boolean {
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get("location") ?? "";
      return location.includes("/login");
    }
    return false;
  }

  async fetchPage(urlPath: string): Promise<string> {
    await this.ensureAuthenticated();
    await this.throttle();

    const url = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;

    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        Cookie: this.getCookieHeader(),
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    this.extractSetCookies(response);

    // Handle redirects
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get("location");
      if (location?.includes("/login")) {
        // Session expired, re-authenticate
        this.authenticated = false;
        await this.login();
        return this.fetchPage(urlPath);
      }
      // Follow non-login redirects
      const redirectUrl = location?.startsWith("http")
        ? location
        : `${this.baseUrl}${location}`;
      return this.fetchPage(redirectUrl);
    }

    if (!response.ok) {
      throw new Error(
        `Gradescope GET ${urlPath} failed (${response.status})`
      );
    }

    const html = await response.text();

    // Update CSRF token from response
    const newToken = this.extractCSRFToken(html);
    if (newToken) this.csrfToken = newToken;

    return html;
  }

  async fetchJSON<T>(urlPath: string): Promise<T> {
    await this.ensureAuthenticated();
    await this.throttle();

    const url = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;

    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        Cookie: this.getCookieHeader(),
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    this.extractSetCookies(response);

    if (this.isLoginRedirect(response)) {
      this.authenticated = false;
      await this.login();
      return this.fetchJSON(urlPath);
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "Unknown error";
      }
      throw new Error(
        `Gradescope GET ${urlPath} failed (${response.status}): ${detail}`
      );
    }

    return (await response.json()) as T;
  }

  async fetchRaw(urlPath: string): Promise<{ data: Buffer; contentType: string }> {
    await this.ensureAuthenticated();
    await this.throttle();

    const url = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;

    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        Cookie: this.getCookieHeader(),
      },
    });

    this.extractSetCookies(response);

    if (!response.ok) {
      throw new Error(
        `Gradescope GET ${urlPath} failed (${response.status})`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      data: Buffer.from(arrayBuffer),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async postForm(
    urlPath: string,
    data: Record<string, string>
  ): Promise<{ html: string; status: number; location: string | null }> {
    await this.ensureAuthenticated();
    await this.throttle();

    const url = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;

    const formBody = new URLSearchParams({
      utf8: "✓",
      authenticity_token: this.csrfToken ?? "",
      ...data,
    });

    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.getCookieHeader(),
        "X-CSRF-Token": this.csrfToken ?? "",
        Referer: url,
        Origin: this.baseUrl,
      },
      body: formBody.toString(),
    });

    this.extractSetCookies(response);

    const html = await response.text();
    const newToken = this.extractCSRFToken(html);
    if (newToken) this.csrfToken = newToken;

    return {
      html,
      status: response.status,
      location: response.headers.get("location"),
    };
  }

  async postJSON<T>(
    urlPath: string,
    data: Record<string, unknown>
  ): Promise<T> {
    await this.ensureAuthenticated();
    await this.throttle();

    const url = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;

    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        "Content-Type": "application/json",
        Cookie: this.getCookieHeader(),
        "X-CSRF-Token": this.csrfToken ?? "",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Referer: url,
        Origin: this.baseUrl,
      },
      body: JSON.stringify(data),
    });

    this.extractSetCookies(response);

    if (this.isLoginRedirect(response)) {
      this.authenticated = false;
      await this.login();
      return this.postJSON(urlPath, data);
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "Unknown error";
      }
      throw new Error(
        `Gradescope POST ${urlPath} failed (${response.status}): ${detail}`
      );
    }

    return (await response.json()) as T;
  }

  async putJSON<T>(
    urlPath: string,
    data: Record<string, unknown>
  ): Promise<T> {
    await this.ensureAuthenticated();
    await this.throttle();

    const url = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;

    const response = await fetch(url, {
      method: "PUT",
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        "Content-Type": "application/json",
        Cookie: this.getCookieHeader(),
        "X-CSRF-Token": this.csrfToken ?? "",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Referer: url,
        Origin: this.baseUrl,
      },
      body: JSON.stringify(data),
    });

    this.extractSetCookies(response);

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "Unknown error";
      }
      throw new Error(
        `Gradescope PUT ${urlPath} failed (${response.status}): ${detail}`
      );
    }

    return (await response.json()) as T;
  }

  async postMultipart(
    urlPath: string,
    filePaths: string[],
    additionalFields?: Record<string, string>
  ): Promise<{ html: string; status: number; location: string | null }> {
    await this.ensureAuthenticated();
    await this.throttle();

    const url = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;

    const formData = new FormData();
    formData.append("utf8", "✓");
    formData.append("authenticity_token", this.csrfToken ?? "");

    if (additionalFields) {
      for (const [key, value] of Object.entries(additionalFields)) {
        formData.append(key, value);
      }
    }

    for (const filePath of filePaths) {
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const blob = new Blob([fileBuffer]);
      formData.append("submission[files][]", blob, fileName);
    }

    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        Cookie: this.getCookieHeader(),
        "X-CSRF-Token": this.csrfToken ?? "",
        Referer: url,
        Origin: this.baseUrl,
      },
      body: formData,
    });

    this.extractSetCookies(response);

    const html = await response.text();
    const newToken = this.extractCSRFToken(html);
    if (newToken) this.csrfToken = newToken;

    return {
      html,
      status: response.status,
      location: response.headers.get("location"),
    };
  }

  async patchJSON<T>(
    urlPath: string,
    data: Record<string, unknown>
  ): Promise<T> {
    await this.ensureAuthenticated();
    await this.throttle();

    const url = urlPath.startsWith("http")
      ? urlPath
      : `${this.baseUrl}${urlPath}`;

    const response = await fetch(url, {
      method: "PATCH",
      redirect: "manual",
      headers: {
        "User-Agent": "GradescopeMCP/1.0",
        "Content-Type": "application/json",
        Cookie: this.getCookieHeader(),
        "X-CSRF-Token": this.csrfToken ?? "",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
        Referer: url,
        Origin: this.baseUrl,
      },
      body: JSON.stringify(data),
    });

    this.extractSetCookies(response);

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "Unknown error";
      }
      throw new Error(
        `Gradescope PATCH ${urlPath} failed (${response.status}): ${detail}`
      );
    }

    return (await response.json()) as T;
  }
}
