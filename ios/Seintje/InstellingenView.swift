import SwiftUI

struct InstellingenView: View {
    @State private var store = Store.shared
    @Environment(\.dismiss) private var dismiss
    @State private var testUitslag: String?
    @State private var bezig = false
    @State private var wissen = false
    @State private var gekopieerd: String?

    private var voorbeeld: String {
        """
        curl -X POST \(store.webhookURL) \\
          -H "Content-Type: application/json" \\
          -d '{"titel":"Nieuwe bestelling","tekst":"€ 89,00","bron":"Shop"}'
        """
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    kopieerRij(store.webhookURL, label: "Webhook-URL")
                    kopieerRij(voorbeeld, label: "Voorbeeld (curl)")
                } header: {
                    Text("Jouw adres")
                } footer: {
                    Text("Werkt met JSON, formulieren, platte tekst en GET. Velden die Seintje herkent: titel/title, tekst/message/body, bron/source, url en prioriteit=hoog. Zet ?bron=Naam achter de URL om een dienst een eigen naam te geven. GitHub, Stripe en Shopify worden vanzelf herkend.")
                }

                Section("Push") {
                    LabeledContent("Status", value: store.pushStatus)
                    Button {
                        bezig = true
                        Task {
                            testUitslag = await store.stuurTest()
                            bezig = false
                        }
                    } label: {
                        HStack {
                            Text("Stuur testmelding")
                            if bezig { Spacer(); ProgressView() }
                        }
                    }
                    if let testUitslag {
                        Text(testUitslag).font(.footnote).foregroundStyle(.secondary)
                    }
                }

                Section("Server") {
                    TextField("https://…", text: $store.serverURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("App-sleutel", text: $store.appSleutel)
                    SecureField("Webhook-sleutel", text: $store.hookSleutel)
                }

                Section {
                    Button("Alle meldingen verwijderen", role: .destructive) { wissen = true }
                        .disabled(store.meldingen.isEmpty)
                }
            }
            .navigationTitle("Instellingen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Klaar") { dismiss() } }
            }
            .confirmationDialog("Alle \(store.meldingen.count) meldingen verwijderen?", isPresented: $wissen, titleVisibility: .visible) {
                Button("Verwijder alles", role: .destructive) { Task { await store.verwijderAlles() } }
            }
        }
    }

    private func kopieerRij(_ tekst: String, label: String) -> some View {
        Button {
            UIPasteboard.general.string = tekst
            gekopieerd = label
            Task { try? await Task.sleep(for: .seconds(1.5)); if gekopieerd == label { gekopieerd = nil } }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Spacer()
                    Label(gekopieerd == label ? "Gekopieerd" : "Kopieer", systemImage: gekopieerd == label ? "checkmark" : "doc.on.doc")
                        .font(.caption)
                }
                Text(tekst)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(.primary)
                    .lineLimit(6)
            }
        }
    }
}
