import SwiftUI

struct OverzichtView: View {
    @State private var store = Store.shared
    @State private var pad: [Melding] = []
    @State private var bronFilter: String?
    @State private var alleenOngelezen = false
    @State private var zoek = ""
    @State private var instellingen = false

    private var gefilterd: [Melding] {
        store.meldingen.filter { m in
            (bronFilter == nil || m.bron == bronFilter)
                && (!alleenOngelezen || !m.gelezen)
                && (zoek.isEmpty || [m.titel, m.tekst, m.bron].contains { $0.localizedCaseInsensitiveContains(zoek) })
        }
    }

    // Per dag gegroepeerd, nieuwste dag bovenaan
    private var perDag: [(dag: Date, items: [Melding])] {
        Dictionary(grouping: gefilterd) { Calendar.current.startOfDay(for: $0.datum) }
            .map { ($0.key, $0.value) }
            .sorted { $0.dag > $1.dag }
    }

    var body: some View {
        NavigationStack(path: $pad) {
            List {
                if store.bronnen.count > 1 {
                    BronFilter(bronnen: store.bronnen, gekozen: $bronFilter)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                if let fout = store.fout {
                    Label(fout, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
                ForEach(perDag, id: \.dag) { groep in
                    Section(dagNaam(groep.dag)) {
                        ForEach(groep.items) { m in
                            NavigationLink(value: m) { MeldingRij(melding: m) }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) { Task { await store.verwijder([m.id]) } } label: { Label("Verwijder", systemImage: "trash") }
                                }
                                .swipeActions(edge: .leading) {
                                    if !m.gelezen {
                                        Button { Task { await store.markeerGelezen([m.id]) } } label: { Label("Gelezen", systemImage: "envelope.open") }
                                            .tint(.blue)
                                    }
                                }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .overlay {
                if gefilterd.isEmpty {
                    if store.meldingen.isEmpty {
                        LeegView(webhookURL: store.webhookURL)
                    } else {
                        ContentUnavailableView.search
                    }
                }
            }
            .navigationTitle("Seintje")
            .navigationDestination(for: Melding.self) { DetailView(melding: $0) }
            .searchable(text: $zoek, prompt: "Zoeken")
            .refreshable { await store.laad() }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { instellingen = true } label: { Image(systemName: "gearshape") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Toggle("Alleen ongelezen", systemImage: "circle.fill", isOn: $alleenOngelezen)
                        Button("Alles gelezen", systemImage: "checkmark.circle") { Task { await store.allesGelezen() } }
                            .disabled(store.ongelezen == 0)
                    } label: {
                        Image(systemName: alleenOngelezen ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    }
                }
            }
            .sheet(isPresented: $instellingen) { InstellingenView() }
            .onChange(of: store.openId) { _, id in
                guard let id, let m = store.meldingen.first(where: { $0.id == id }) else { return }
                pad = [m]
                store.openId = nil
            }
        }
    }

    private func dagNaam(_ dag: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(dag) { return "Vandaag" }
        if cal.isDateInYesterday(dag) { return "Gisteren" }
        return dag.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }
}

struct MeldingRij: View {
    let melding: Melding

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            BronIcoon(bron: melding.bron)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(melding.bron)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(melding.datum, format: .dateTime.hour().minute())
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if !melding.gelezen {
                        Circle().fill(.tint).frame(width: 8, height: 8)
                    }
                }
                HStack(spacing: 4) {
                    if melding.isHoog {
                        Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.red)
                    }
                    Text(melding.titel)
                        .font(.subheadline.weight(melding.gelezen ? .regular : .semibold))
                        .lineLimit(1)
                }
                if !melding.tekst.isEmpty {
                    Text(melding.tekst)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct BronIcoon: View {
    let bron: String
    var maat: CGFloat = 36

    private static let symbolen: [String: String] = [
        "github": "chevron.left.forwardslash.chevron.right", "gitlab": "chevron.left.forwardslash.chevron.right",
        "stripe": "creditcard.fill", "mollie": "creditcard.fill", "shopify": "bag.fill", "vercel": "triangle.fill",
        "seintje": "bell.fill", "webhook": "arrow.down.to.line", "mail": "envelope.fill", "server": "server.rack",
    ]
    private static let kleuren: [Color] = [.blue, .indigo, .purple, .pink, .orange, .teal, .green, .mint, .cyan, .brown]

    // Vaste kleur per bron (String.hashValue verschilt per start, dus zelf tellen)
    private var kleur: Color {
        if bron.lowercased() == "seintje" { return .accentColor }
        let som = bron.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xffff }
        return Self.kleuren[som % Self.kleuren.count]
    }

    var body: some View {
        RoundedRectangle(cornerRadius: maat * 0.28, style: .continuous)
            .fill(kleur.gradient)
            .frame(width: maat, height: maat)
            .overlay {
                if let s = Self.symbolen[bron.lowercased()] {
                    Image(systemName: s).font(.system(size: maat * 0.42, weight: .semibold))
                } else {
                    Text(bron.prefix(1).uppercased()).font(.system(size: maat * 0.46, weight: .bold, design: .rounded))
                }
            }
            .foregroundStyle(.white)
    }
}

struct BronFilter: View {
    let bronnen: [(naam: String, aantal: Int)]
    @Binding var gekozen: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                knop("Alles", aantal: nil, actief: gekozen == nil) { gekozen = nil }
                ForEach(bronnen, id: \.naam) { b in
                    knop(b.naam, aantal: b.aantal, actief: gekozen == b.naam) { gekozen = gekozen == b.naam ? nil : b.naam }
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 6)
        }
    }

    private func knop(_ naam: String, aantal: Int?, actief: Bool, actie: @escaping () -> Void) -> some View {
        Button(action: actie) {
            HStack(spacing: 4) {
                Text(naam)
                if let aantal { Text("\(aantal)").foregroundStyle(actief ? .white.opacity(0.8) : .secondary) }
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(actief ? AnyShapeStyle(.tint) : AnyShapeStyle(.background.secondary), in: Capsule())
            .foregroundStyle(actief ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

struct LeegView: View {
    let webhookURL: String

    var body: some View {
        ContentUnavailableView {
            Label("Nog geen seintjes", systemImage: "bell.badge")
        } description: {
            Text("Stuur een webhook of API-verzoek naar je eigen adres en hij verschijnt hier als melding.")
        } actions: {
            Button("Kopieer webhook-URL", systemImage: "doc.on.doc") { UIPasteboard.general.string = webhookURL }
                .buttonStyle(.borderedProminent)
        }
    }
}
