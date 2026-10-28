import SwiftUI
import UserNotifications

struct Melding: Codable, Identifiable, Hashable {
    let id: String
    let tijd: Double
    var gelezen: Bool
    let bron: String
    let titel: String
    let tekst: String
    let url: String?
    let prioriteit: String?
    let ruw: String?
    let soort: String?

    var datum: Date { Date(timeIntervalSince1970: tijd / 1000) }
    var isHoog: Bool { prioriteit == "hoog" }
    var link: URL? { url.flatMap { $0.isEmpty ? nil : URL(string: $0) } }
}

/// Alles wat de app weet: meldingen, instellingen en push-status. Eén gedeelde instantie.
@Observable
final class Store {
    static let shared = Store()

    var meldingen: [Melding] = []
    var laden = false
    var fout: String?
    var pushStatus = "Nog niet aangemeld"
    var openId: String?

    // Instellingen; standaard uit Secrets.plist, aan te passen in de app
    var serverURL: String { didSet { UserDefaults.standard.set(serverURL, forKey: "serverURL") } }
    var appSleutel: String { didSet { UserDefaults.standard.set(appSleutel, forKey: "appSleutel") } }
    var hookSleutel: String { didSet { UserDefaults.standard.set(hookSleutel, forKey: "hookSleutel") } }

    var webhookURL: String { "\(serverURL.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/in/\(hookSleutel)" }
    var ongelezen: Int { meldingen.filter { !$0.gelezen }.count }
    var bronnen: [(naam: String, aantal: Int)] {
        Dictionary(grouping: meldingen, by: \.bron)
            .map { ($0.key, $0.value.count) }
            .sorted { $0.aantal > $1.aantal }
    }

    private let cache = URL.applicationSupportDirectory.appending(path: "meldingen.json")

    private init() {
        let geheim = Bundle.main.url(forResource: "Secrets", withExtension: "plist")
            .flatMap { NSDictionary(contentsOf: $0) as? [String: String] } ?? [:]
        let d = UserDefaults.standard
        serverURL = d.string(forKey: "serverURL") ?? geheim["ServerURL"] ?? ""
        appSleutel = d.string(forKey: "appSleutel") ?? geheim["AppSleutel"] ?? ""
        hookSleutel = d.string(forKey: "hookSleutel") ?? geheim["HookSleutel"] ?? ""
        if let data = try? Data(contentsOf: cache), let lijst = try? JSONDecoder().decode([Melding].self, from: data) {
            meldingen = lijst
        }
    }

    // MARK: - Server

    private struct Overzicht: Decodable { let meldingen: [Melding] }
    private struct PushAntwoord: Decodable { struct Push: Decodable { let verstuurd: Int; let mislukt: Int; let reden: String? }; let push: Push }

    private func verzoek(_ pad: String, methode: String = "GET", body: [String: Any]? = nil) async throws -> Data {
        guard let url = URL(string: serverURL + pad), !serverURL.isEmpty else { throw Fout("Vul eerst het serveradres in bij Instellingen") }
        var req = URLRequest(url: url)
        req.httpMethod = methode
        req.setValue("Bearer \(appSleutel)", forHTTPHeaderField: "Authorization")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, antwoord) = try await URLSession.shared.data(for: req)
        let status = (antwoord as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            let melding = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["fout"] as? String
            throw Fout(melding ?? "Server gaf \(status)")
        }
        return data
    }

    func laad() async {
        laden = true
        defer { laden = false }
        do {
            let data = try await verzoek("/api/meldingen")
            meldingen = try JSONDecoder().decode(Overzicht.self, from: data).meldingen
            fout = nil
            bewaarCache()
            await werkBadgeBij()
        } catch {
            fout = error.localizedDescription
        }
    }

    func markeerGelezen(_ ids: [String]) async {
        let nieuw = ids.filter { id in meldingen.contains { $0.id == id && !$0.gelezen } }
        guard !nieuw.isEmpty else { return }
        for i in meldingen.indices where nieuw.contains(meldingen[i].id) { meldingen[i].gelezen = true }
        await werkBadgeBij()
        _ = try? await verzoek("/api/meldingen", methode: "POST", body: ["actie": "gelezen", "ids": nieuw])
        bewaarCache()
    }

    func allesGelezen() async {
        for i in meldingen.indices { meldingen[i].gelezen = true }
        await werkBadgeBij()
        _ = try? await verzoek("/api/meldingen", methode: "POST", body: ["actie": "gelezen", "alle": true])
        bewaarCache()
    }

    func verwijder(_ ids: [String]) async {
        meldingen.removeAll { ids.contains($0.id) }
        await werkBadgeBij()
        _ = try? await verzoek("/api/meldingen", methode: "POST", body: ["actie": "verwijder", "ids": ids])
        bewaarCache()
    }

    func verwijderAlles() async {
        meldingen = []
        await werkBadgeBij()
        _ = try? await verzoek("/api/meldingen", methode: "POST", body: ["actie": "verwijder", "alle": true])
        bewaarCache()
    }

    func stuurTest() async -> String {
        do {
            let data = try await verzoek("/api/test", methode: "POST")
            let p = try JSONDecoder().decode(PushAntwoord.self, from: data).push
            await laad()
            if p.verstuurd > 0 { return "Verstuurd naar \(p.verstuurd) apparaat\(p.verstuurd == 1 ? "" : "en")" }
            return "Opgeslagen, maar geen push: \(p.reden ?? "geen apparaat aangemeld")"
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: - Push

    func vraagPushToestemming() async {
        let center = UNUserNotificationCenter.current()
        let ja = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if ja {
            UIApplication.shared.registerForRemoteNotifications()
        } else {
            pushStatus = "Meldingen staan uit (Instellingen › Seintje)"
        }
    }

    func registreerApparaat(_ token: String) async {
        #if DEBUG
        let omgeving = "sandbox"
        #else
        let omgeving = "productie"
        #endif
        do {
            _ = try await verzoek("/api/apparaat", methode: "POST", body: ["token": token, "omgeving": omgeving, "naam": UIDevice.current.name])
            pushStatus = "Aangemeld voor pushmeldingen"
        } catch {
            pushStatus = "Aanmelden mislukt: \(error.localizedDescription)"
        }
    }

    private func werkBadgeBij() async {
        try? await UNUserNotificationCenter.current().setBadgeCount(ongelezen)
    }

    private func bewaarCache() {
        try? FileManager.default.createDirectory(at: cache.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(meldingen).write(to: cache, options: .atomic)
    }
}

struct Fout: LocalizedError {
    let errorDescription: String?
    init(_ tekst: String) { errorDescription = tekst }
}
