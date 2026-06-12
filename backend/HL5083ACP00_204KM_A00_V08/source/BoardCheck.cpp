#pragma once

#include "stdafx.h"
#include "BoardCheck.h"
#include "assert.h"
#include <fstream>
#include <time.h>
#pragma comment(lib, "User32.lib")
#pragma comment(lib, "Gdi32.lib")

extern "C" int GetPgsFullPath(LPTSTR pgsPath, int chNum);

BoardCheck *boardcheck_ptr;
DWORD serial;

#define ID_REDO					100
#define ID_EXIT                 101
#define ID_LISTBOX              102

//int globalsite_BC;
//BYTE sitesta_BC[SITE_NUM];
//#define SITE_BC globalsite_BC
//#define SERIAL_BC \
//		StsGetSiteStatus(sitesta_BC, SITE_NUM); \
//        for(globalsite_BC=0;globalsite_BC<SITE_NUM;globalsite_BC++) \
//			if(sitesta_BC[SITE_BC]) \

int globalsite_BC;
#define SITE_BC globalsite_BC
#define SERIAL_BC \
        for(globalsite_BC=0;globalsite_BC<SITE_NUM;globalsite_BC++) \
			if(site_connected[SITE_BC]) \

#define REALLOC(ptr,type,count)              \
    {                                        \
        int siz=sizeof(type)*(count);        \
        if(ptr) {                            \
            ptr=(type*)realloc(ptr,siz);     \
            assert(ptr);                     \
        } else {                             \
            ptr=(type*)malloc(siz);          \
            assert(ptr);                     \
            memset(ptr,0,siz);               \
        }                                    \
        assert(ptr);                         \
    }
#define FREE(ptr) if(ptr) {free(ptr);ptr=NULL;}

// common funcitons
string int2str(DWORD n) {
 
    char t[64];
    int i = 0;

	if(n == 0)
		return "0";
 
    while (n) {
		t[i++] = char((n % 10) + '0');
        n /= 10;
    }
    t[i] = 0;

	string result(t);
	result = result.assign(result.rbegin(), result.rend());
 
    return result;
}

string float2str(double f){
    char buf[64];
	_gcvt_s(buf, 64, f, 8);
	string result(buf);
	if(result.length() > 1)
		if(result.find(".") == result.length() - 1){
			string temp(result, 0, result.length() - 1);
			result = temp;
		}

	return result;
}

BOOL IsFileExist(const char * file_name){
	fstream file;
	file.open(file_name, ios::in);
	if(!file){
		return FALSE;
	}
	else{
		file.close();
		return TRUE;
	}

}

BOOL IsFileOpen(string file){
	HANDLE hFile = CreateFile(file.c_str(),		 // file to open
					   GENERIC_READ,		 // open for reading
					   0,					 // share for reading
					   NULL,				 // default security
					   OPEN_EXISTING,		 // existing file only
					   FILE_ATTRIBUTE_NORMAL,// normal file
					   NULL);				 // no attr. template
	
	if(hFile == INVALID_HANDLE_VALUE){	// file is open
		CloseHandle(hFile);  
		return TRUE;
	}
	else{
		CloseHandle(hFile);  
		return FALSE;
	}
}

string GetSysTime(void){
	time_t raw_time;
	tm time_info;
	time(&raw_time);
	localtime_s(&time_info, &raw_time);
	char c_time[32];

	strftime(c_time, sizeof(c_time), "%Y-%m-%d,%H:%M:%S", &time_info);
	string str_time(c_time);

	return str_time;
}

DialogTemplate::DialogTemplate(LPCSTR caption, DWORD style, int x, int y, int w, int h,
        LPCSTR font, WORD fontSize)
{
    usedBufferLength = sizeof(DLGTEMPLATE );
    totalBufferLength = usedBufferLength;

    dialogTemplate = (DLGTEMPLATE*)malloc(totalBufferLength);
    assert(dialogTemplate);

    dialogTemplate->style = style;

    if (font != NULL) {
        dialogTemplate->style |= DS_SETFONT;
    }

    dialogTemplate->x     = x;
    dialogTemplate->y     = y;
    dialogTemplate->cx    = w;
    dialogTemplate->cy    = h;
    dialogTemplate->cdit  = 0;

    dialogTemplate->dwExtendedStyle = 0;

    // The dialog box doesn't have a menu or a special class
    //AppendData(_T("\0"), 2);
    //AppendData(_T("\0"), 2);
	//lzg
    AppendData("\0", 2);
    AppendData("\0", 2);

    // Add the dialog's caption to the template
    AppendString(caption);

    if (font != NULL) {
        AppendData(&fontSize, sizeof(WORD));
        AppendString(font);
    }

}

void DialogTemplate::AddComponent(LPCSTR type, LPCSTR caption, DWORD style, DWORD exStyle,
        int x, int y, int w, int h, WORD id)
{
    DLGITEMTEMPLATE item;

    item.style = style;
    item.x     = x;
    item.y     = y;
    item.cx    = w;
    item.cy    = h;
    item.id    = id;

    item.dwExtendedStyle = exStyle;

    AppendData(&item, sizeof(DLGITEMTEMPLATE));

    AppendString(type);
    AppendString(caption);

    WORD creationDataLength = 0;
    AppendData(&creationDataLength, sizeof(WORD));

    // Increment the component count
    dialogTemplate->cdit++;
}


void DialogTemplate::AddButton(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id)
{
    AddStandardComponent(0x0080, caption, style, exStyle, x, y, w, h, id);

    WORD creationDataLength = 0;
    AppendData(&creationDataLength, sizeof(WORD));

}

void DialogTemplate::AddEditBox(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id)
{
    AddStandardComponent(0x0081, caption, style, exStyle, x, y, w, h, id);

    WORD creationDataLength = 0;
    AppendData(&creationDataLength, sizeof(WORD));
}

void DialogTemplate::AddStatic(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id)
{
    AddStandardComponent(0x0082, caption, style, exStyle, x, y, w, h, id);

    WORD creationDataLength = 0;
    AppendData(&creationDataLength, sizeof(WORD));
}

void DialogTemplate::AddListBox(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id)
{
    AddStandardComponent(0x0083, caption, style, exStyle, x, y, w, h, id);

    WORD creationDataLength = 0;
    AppendData(&creationDataLength, sizeof(WORD));
}

void DialogTemplate::AddScrollBar(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id)
{
    AddStandardComponent(0x0084, caption, style, exStyle, x, y, w, h, id);

    WORD creationDataLength = 0;
    AppendData(&creationDataLength, sizeof(WORD));
}

void DialogTemplate::AddComboBox(LPCSTR caption, DWORD style, DWORD exStyle, int x, int y,
        int w, int h, WORD id)
{
    AddStandardComponent(0x0085, caption, style, exStyle, x, y, w, h, id);

    WORD creationDataLength = 0;
    AppendData(&creationDataLength, sizeof(WORD));
}

    /**
     * Returns a pointer to the Win32 dialog template which the object
     * represents. This pointer may become invalid if additional
     * components are added to the template.
     */

DialogTemplate::operator const DLGTEMPLATE*() const
{
    return dialogTemplate;
}

DialogTemplate::~DialogTemplate()
{
    free(dialogTemplate);
}

void DialogTemplate::AddStandardComponent(WORD type, LPCSTR caption, DWORD style,
        DWORD exStyle, int x, int y, int w, int h, WORD id)
{
    DLGITEMTEMPLATE item;

    // DWORD algin the beginning of the component data
    AlignData(sizeof(DWORD));

    item.style = style;
    item.x     = x;
    item.y     = y;
    item.cx    = w;
    item.cy    = h;
    item.id    = id;

    item.dwExtendedStyle = exStyle;

    AppendData(&item, sizeof(DLGITEMTEMPLATE));

    WORD preType = 0xFFFF;

    AppendData(&preType, sizeof(WORD));
    AppendData(&type, sizeof(WORD));

    AppendString(caption);

    // Increment the component count
    dialogTemplate->cdit++;
}

void DialogTemplate::AlignData(int size)
{
    int paddingSize = usedBufferLength % size;

    if (paddingSize != 0) {
        EnsureSpace(paddingSize);
        usedBufferLength += paddingSize;
    }
}

void DialogTemplate::AppendString(LPCSTR string)
{
    int length = MultiByteToWideChar(CP_ACP, 0, string, -1, NULL, 0);

    WCHAR* wideString = (WCHAR*)malloc(sizeof(WCHAR) * length);
    MultiByteToWideChar(CP_ACP, 0, string, -1, wideString, length);

    AppendData(wideString, length * sizeof(WCHAR));
    free(wideString);
}

void DialogTemplate::AppendData(void* data, int dataLength)
{
    EnsureSpace(dataLength);

    memcpy((char*)dialogTemplate + usedBufferLength, data, dataLength);
    usedBufferLength += dataLength;
}

void DialogTemplate::EnsureSpace(int length)
{
    if (length + usedBufferLength > totalBufferLength) {
        totalBufferLength += length * 2;

        void* newBuffer = malloc(totalBufferLength);
        assert(newBuffer);
        memcpy(newBuffer, dialogTemplate, usedBufferLength);

        free(dialogTemplate);
        dialogTemplate = (DLGTEMPLATE*)newBuffer;
    }
}

///////////////////
//
// BoardCheckButton
//
///////////////////
BoardCheckButton::BoardCheckButton(char *aname,int aid,int def_style)
{
    name=_strdup(aname);
    id=aid;
    style=def_style;
}

BoardCheckButton::~BoardCheckButton()
{
    FREE(name);
}

int BoardCheckButton::width()
{
    return (int)(strlen(name)*4.1+30);
}

int BoardCheckButton::height()
{
    return 15;
}

void BoardCheckButton::create_dialog(DialogTemplate *dialog,int x,int y,int *newid)
{
    dialog->AddButton(name,WS_VISIBLE|WS_TABSTOP|style,0,x,y,width(),height(),id);
}


///////////////////
//
// BoardCheckListBox
//
///////////////////
BoardCheckListBox::BoardCheckListBox(char *aname,int aid,int def_style)
{
    name=_strdup(aname);
    id=aid;
    style=def_style;
}

BoardCheckListBox::~BoardCheckListBox()
{
    FREE(name);
}

int BoardCheckListBox::width()
{
    return 291;
}

int BoardCheckListBox::height()
{
    return 267;
}

void BoardCheckListBox::create_dialog(DialogTemplate *dialog,int x,int y,int *newid)
{
    dialog->AddListBox(name,WS_VISIBLE|WS_HSCROLL|LBS_OWNERDRAWVARIABLE|LBS_HASSTRINGS|style,0,x,y,width(),height(),id);
}

//void BoardCheckListBox::command(HWND hDlg,int code,int target_id)
//{
    //if(code==LB_ADDSTRING && target_id==id) {
        //SendDlgItemMessage(hDlg,ID_LISTBOX,LB_ADDSTRING,0,(LPARAM)"Try to add string....");
				//SendDlgItemMessage(hDlg,ID_LISTBOX,LB_ADDSTRING,0,(LPARAM)"Try to add string....");
    //}
//}


///////////////////
//
// BoardCheckGroup
//
///////////////////
BoardCheckGroup::BoardCheckGroup(int vertical,int aospace,int aispace)
{
    is_vertical=vertical;
    no=0;
    ospace=aospace;
    ispace=aispace;
    member=NULL;
}

BoardCheckGroup::~BoardCheckGroup()
{
    int i;
    for(i=0;i<no;i++)
        delete member[i];
    FREE(member);
}

void BoardCheckGroup::add(BoardCheckElement *el)
{
    REALLOC(member,LPBoardCheckElement,++no);
    member[no-1]=el;
}

void BoardCheckGroup::get(HWND hDlg)
{
    int i;
    for(i=0;i<count();i++)
        member[i]->get(hDlg);
}

void BoardCheckGroup::set(HWND hDlg)
{
    int i;
    for(i=0;i<count();i++)
        member[i]->set(hDlg);
}

void BoardCheckGroup::dlg_file(HWND hDlg,char *fname,int len)
{
    int i;
    for(i=0;i<count();i++)
        member[i]->dlg_file(hDlg,fname,len);
}

void BoardCheckGroup::create_dialog(DialogTemplate *dialog,int x,int y,int *newid)
{
    int i;
    int offs=ospace;
    if(!count())
        return;
    for(i=0;i<count();i++)
        if(is_vertical) {
            member[i]->create_dialog(dialog,x+ospace,y+offs,newid);
            offs+=member[i]->height()+ispace;
        } else {
            member[i]->create_dialog(dialog,x+offs,y+ospace,newid);
            offs+=member[i]->width()+ispace;
        }
    id=(*newid)++;
    if(ospace && ispace)
        dialog->AddStatic("",WS_VISIBLE|SS_GRAYFRAME,0,x,y,width(),height(),id);
}

void BoardCheckGroup::command(HWND hDlg,int code,int target_id)
{
    int i;
    for(i=0;i<count();i++)
        member[i]->command(hDlg,code,target_id);
}

int BoardCheckGroup::count()
{
    return no;
}

int BoardCheckGroup::width()
{
    int i;
    int w=0;
    int cnt=count();
    if(!cnt)
        return 0;
    if(is_vertical) {
        for(i=0;i<cnt;i++)
            if(member[i]->width()>w)
                w=member[i]->width();
    } else {
        for(i=0;i<cnt;i++)
            w+=member[i]->width();
        if(cnt)
            w+=(cnt-1)*ispace;
    }
    return w+2*ospace;
}

int BoardCheckGroup::height()
{
    int i;
    int w=0;
    int cnt=count();
    if(!cnt)
        return 0;
    if(!is_vertical) {
        for(i=0;i<cnt;i++)
            if(member[i]->height()>w)
                w=member[i]->height();
    } else {
        for(i=0;i<cnt;i++)
            w+=member[i]->height();
        if(cnt)
            w+=(cnt-1)*ispace;
    }
    return w+2*ospace;
}

///////////////////
//
// BoardCheck
//
///////////////////

BoardCheck::BoardCheck()
{
	input=NULL;
	buttons=NULL;
    dialog=NULL;
	CheckPass=FALSE;
	nBtn=BTN_NONE;
    create_input();
	for(int site=0; site<SITE_NUM; ++site){
		site_connected[site] = 0;
		check_result[site] = TRUE;
	}
}

BoardCheck::~BoardCheck()
{
	if(!dialog){
        delete dialog;
		dialog=NULL;
	}
	if(!input){
        delete input;
		input=NULL;
	}
	if(!listbox){
        delete listbox;
		listbox=NULL;
	}
	if(!buttons){
        delete buttons;
		buttons=NULL;
	}
}

BOOL CALLBACK  BoardCheckDialogProc(HWND hDlg, UINT iMsg, WPARAM wParam, LPARAM lParam)
{

    switch (iMsg) {
        case WM_INITDIALOG :
			{
				for(vector<string>::iterator it=boardcheck_ptr->display_vec.begin(); it!=boardcheck_ptr->display_vec.end(); ++it){
					// Add string into listbox
					SendDlgItemMessage(hDlg,ID_LISTBOX,LB_ADDSTRING,0,(LPARAM)(*it).c_str());
				}

				SendMessage (GetDlgItem(hDlg, ID_LISTBOX), LB_SETHORIZONTALEXTENT, /*boardcheck_ptr->nMaxExtent*/2000,0);

				return TRUE ;
			}
			break;

        case WM_COMMAND :
			{
				//// Redo Board Check
				if(wParam == ID_REDO) {
					boardcheck_ptr->nBtn=BTN_REDO;
					EndDialog(hDlg, TRUE);
					return TRUE;
				}
				//// Exit
				if(wParam == ID_EXIT) {
					boardcheck_ptr->nBtn=BTN_EXIT;
					EndDialog(hDlg, TRUE);
					//PostQuitMessage(0);	// Exit ATE UI
					return TRUE;
				}
				if((wParam & 0xFF) == ID_LISTBOX) {
					return TRUE;
				}
				if(wParam == IDCANCEL) {
					boardcheck_ptr->nBtn=BTN_CANCEL;
					EndDialog(hDlg, TRUE);
					//PostQuitMessage(0);	// Exit ATE UI 
					return TRUE;
				}
				//boardcheck_ptr->input->command(hDlg,HIWORD(wParam),LOWORD (wParam));
			}
            break;
		case WM_CTLCOLORLISTBOX:
			break;
		case WM_DRAWITEM:
			{
				LPDRAWITEMSTRUCT lpDrawItem = (LPDRAWITEMSTRUCT)lParam;
				if (lpDrawItem->CtlType == ODT_LISTBOX || lpDrawItem->CtlID == ID_LISTBOX){
					if(lpDrawItem->itemID == -1)	break;

					char szItemString[2000];
					int nItemStringLen;

					SendDlgItemMessage(hDlg, ID_LISTBOX, LB_GETTEXT, (WPARAM)lpDrawItem->itemID, (LPARAM)szItemString);
					nItemStringLen = strlen(szItemString);

					// 设置选中一行时，这一行加边框
					if ((lpDrawItem->itemState & ODS_SELECTED) && (lpDrawItem->itemAction & (ODA_SELECT | ODA_DRAWENTIRE))){
						DrawFocusRect(lpDrawItem->hDC, &lpDrawItem->rcItem); 
						//InvertRect(lpDrawItem->hDC, &lpDrawItem->rcItem); //反色
					}
					else if (!(lpDrawItem->itemState & ODS_SELECTED) && (lpDrawItem->itemAction & ODA_SELECT)){
						DrawFocusRect(lpDrawItem->hDC, &lpDrawItem->rcItem);
						//InvertRect(lpDrawItem->hDC, &lpDrawItem->rcItem); //反色
					}

					string item_str(szItemString, 0, nItemStringLen-1);

					// 文字颜色
					if(item_str.find("FAIL") != string::npos){
						SetTextColor(lpDrawItem->hDC, RGB(255, 0, 0));
					}
					else {
						SetTextColor(lpDrawItem->hDC, RGB(0, 0, 0));
					}

					// 文字背景色
					if(lpDrawItem->itemState & ODS_SELECTED){	// 设置被选中行的背景颜色
						SetBkMode(lpDrawItem->hDC, OPAQUE);
						//SetBkColor(lpDrawItem->hDC, RGB(255, 255, 255));
						SetBkColor(lpDrawItem->hDC, GetSysColor(COLOR_GRAYTEXT));					
					} else {
						SetBkMode(lpDrawItem->hDC, OPAQUE);
						SetBkColor(lpDrawItem->hDC, GetSysColor(COLOR_WINDOW));					
					}

					DrawText(lpDrawItem->hDC, szItemString, nItemStringLen, &lpDrawItem->rcItem, DT_LEFT | DT_SINGLELINE);
					return TRUE;
				}
			}
			break;
    }
    return FALSE ;
}


void BoardCheck::Display(void)
{
    int id=200; // start value for ids
    HWND shell=GetForegroundWindow();

	if(!IsCheckPass()){
		output_format();

		//delete_input();
		create_input();
		buttons->add(new BoardCheckButton("重做诊断",ID_REDO,BS_DEFPUSHBUTTON));
		buttons->add(new BoardCheckButton("退出",ID_EXIT,BS_DEFPUSHBUTTON));
		listbox->add(new BoardCheckListBox("ListBox",ID_LISTBOX));

		string str_result("诊断结果：");
		SERIAL_BC {
			if(check_result[SITE_BC]){
				str_result = str_result + "工位(" + int2str(SITE_BC+1) + ") Pass ";
			} else {
				str_result = str_result + "工位(" + int2str(SITE_BC+1) + ") Fail ";
			}
		}
		dialog=new DialogTemplate(str_result.c_str(), WS_CAPTION | DS_CENTER, 10, 10, 300, 300);
		input->create_dialog(dialog,0,0,&id);
		boardcheck_ptr=this;
		INT_PTR ret = DialogBoxIndirectA(NULL,
			   *dialog,
			   shell,
			   (DLGPROC) BoardCheckDialogProc);

		delete dialog;
		dialog=NULL;
	} 
}

void BoardCheck::create_input(void)
{
	input=new BoardCheckGroup(1,4,0);            // vertical aligned

	listbox=new BoardCheckGroup(0,0,0);
    input->add(listbox);

    buttons=new BoardCheckGroup(0,4,4);
    input->add(buttons);
}

void BoardCheck::delete_input(void)
{
	if(listbox->count()){
        delete listbox;
		listbox=NULL;
	}
	if(buttons->count()){
        delete buttons;
		buttons=NULL;
	}
	if(input->count()){
        delete input;
		input=NULL;
	}
}

BOOL BoardCheck::log(DWORD tnum, const char *component, double *result, double lolim, double hilim, const char *unit)
{
	bc_log.component_vec.push_back(component);
	bc_log.tnum_map[component] = tnum;
	bc_log.lolim_map[component] = lolim;
	bc_log.hilim_map[component] = hilim;
	bc_log.unit_map[component] = unit;

	SERIAL_BC bc_log.data_map[component][SITE_BC] = result[SITE_BC];
	SERIAL_BC{
		if((result[SITE_BC] >= lolim) && (result[SITE_BC] <= hilim)){
			bc_log.flag_map[component][SITE_BC] = "PASS";
		}
		else{
			bc_log.flag_map[component][SITE_BC] = "FAIL";
			CheckPass = FALSE;
			check_result[SITE_BC] = FALSE;
		}
	}
	SERIAL_BC result[SITE_BC] = 9999;

	return TRUE;
}

BOOL BoardCheck::output_format()
{
	for(vector<string>::iterator it=bc_log.component_vec.begin(); it!=bc_log.component_vec.end(); ++it){
		string temp("T" + int2str(bc_log.tnum_map[*it]) + "   ");
		SERIAL_BC{
			temp = temp + "SITE" + int2str(SITE_BC+1) + "=" + bc_log.flag_map[*it][SITE_BC] + "(" + float2str(bc_log.data_map[*it][SITE_BC]) + bc_log.unit_map[*it] + ")   ";
		}
		temp = temp + "Low Limit=" + float2str(bc_log.lolim_map[*it]) + bc_log.unit_map[*it] + "   ";
		temp = temp + "High Limit=" + float2str(bc_log.hilim_map[*it]) + bc_log.unit_map[*it] + "   ";
		temp = temp + *it;
		display_vec.push_back(temp);
	}

	return TRUE;
}

BOOL BoardCheck::IsCheckPass()
{
	for(vector<string>::iterator it=bc_log.component_vec.begin(); it!=bc_log.component_vec.end(); ++it){
		SERIAL_BC{
			if(bc_log.flag_map[*it][SITE_BC] == "FAIL")
				return FALSE;
		}
	}
	return TRUE;
}

BOOL BoardCheck::report()
{
	char pgsfullpath[300];
	GetPgsFullPath(pgsfullpath, 300);
	string fullpathpgs(pgsfullpath);
	string pathofpgs = "";
	int pos = fullpathpgs.find_last_of('\\');
	if (pos > -1)
	{
		pathofpgs = fullpathpgs.substr(0, pos + 1);
	}
	string file_bc = pathofpgs + "source\\bc.csv";

	if(IsFileOpen(file_bc.c_str())){
		MessageBoxA(NULL, "请确认 bc.csv 文件是否已打开？\n如果打开，请关闭，否则数据无法保存", "诊断提示对话框", MB_OK);
	}

	fstream file;
	file.open(file_bc.c_str(), ios::app);

	string time(GetSysTime());
	string result_flag;
	if(IsCheckPass())
		result_flag = "PASS";
	else
		result_flag = "FAIL";
	file << "Time," + time << ","  << "Final," + result_flag  + ",Serial," + int2str(++serial) << endl;
	for(vector<string>::iterator it=bc_log.component_vec.begin(); it!=bc_log.component_vec.end(); ++it){
		string temp("T" + int2str(bc_log.tnum_map[*it]) + ",");
		SERIAL_BC{
			temp = temp + "SITE" + int2str(SITE_BC+1) + "," + bc_log.flag_map[*it][SITE_BC] + "," + float2str(bc_log.data_map[*it][SITE_BC]) + ",";
		}
		temp = temp + "Low Limit," + float2str(bc_log.lolim_map[*it]) + ",";
		temp = temp + "High Limit," + float2str(bc_log.hilim_map[*it]) + "," + bc_log.unit_map[*it] + ",";
		temp = temp + "\"" + *it + "\"";
		file << temp << endl;
	}

	file.flush();
	file.close();

	return TRUE;
}

double get_scale(string str_unit){
	if((str_unit == "mA") || (str_unit == "mV") || (str_unit == "mOhm") || (str_unit == "mF") || (str_unit == "mUnit"))
		return 1e3;
	else if((str_unit == "uA") || (str_unit == "uV") || (str_unit == "uF") || (str_unit == "uUnit"))
		return 1e6;
	else if((str_unit == "nA") || (str_unit == "nV") || (str_unit == "nF") || (str_unit == "nUnit"))
		return 1e9;
	else if((str_unit == "pA") || (str_unit == "pV") || (str_unit == "pF") || (str_unit == "pUnit"))
		return 1e12;
	else if((str_unit == "kOhm") || (str_unit == "kUnit"))
		return 1e-3;
	else if((str_unit == "MOhm") || (str_unit == "MUnit"))
		return 1e-6;

	return 1;
}

BOOL BoardCheck::test_i(FOVI &fovi_res, Cvi_config &vi, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1)
{
	double result[SITE_NUM];

	if(vi.mode == FV)
		fovi_res.Set(FV, vi.v, vi.v_range, vi.i_range, RELAY_ON);
	else
		fovi_res.Set(FI, vi.i, vi.v_range, vi.i_range, RELAY_ON);

	delay_ms(vi.delay);

	fovi_res.MeasureVI(vi.sample_times, vi.sample_period);
	SERIAL_BC result[SITE_BC]=fovi_res.GetMeasResult(SITE_BC, MIRET) * get_scale(unit);	

 	fovi_res.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_ON);
 	fovi_res.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_OFF);

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result, lolim, hilim, unit);

	return TRUE;
}

BOOL BoardCheck::test_v(FOVI &fovi_res, Cvi_config &vi, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1)
{
	double result[SITE_NUM];

	if(vi.mode == FV)
		fovi_res.Set(FV, vi.v, vi.v_range, vi.i_range, RELAY_ON);
	else
		fovi_res.Set(FI, vi.i, vi.v_range, vi.i_range, RELAY_ON);

	delay_ms(vi.delay);

    fovi_res.MeasureVI(vi.sample_times, vi.sample_period);
	SERIAL_BC result[SITE_BC]=fovi_res.GetMeasResult(SITE_BC, MVRET) * get_scale(unit);	

 	fovi_res.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_OFF);

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result, lolim, hilim, unit);

	return TRUE;
}

BOOL BoardCheck::test_v(FOVI &fovi_res1, FOVI &fovi_res2, FPVI10 &fpvi_res, DWORD tnum, const char* component, double *result1)	// dual ch fovi, force v, fpvi measure the diff of fovis
{
	double result[SITE_NUM];
	fovi_res1.Set(FV, 1, FOVI_5V, FOVI_10MA, RELAY_ON);
	fovi_res2.Set(FV, 3.6, FOVI_5V, FOVI_10MA, RELAY_ON);
	fpvi_res.Set(FI, 2e-6,  FPVI10_10V, FPVI10_10UA, RELAY_ON);

	delay_ms(10);

    fpvi_res.MeasureVI(10, 10);
	SERIAL_BC result[SITE_BC]=fpvi_res.GetMeasResult(SITE_BC, MVRET);	

	fovi_res1.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_ON);
	fovi_res2.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_ON);
	fovi_res1.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_OFF);
	fovi_res2.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_OFF);
	fpvi_res.Set(FI, 0,  FPVI10_10V, FPVI10_10UA, RELAY_OFF);

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result, 2.5, 2.7, "V");

	return TRUE;
}

BOOL BoardCheck::test_v(FOVI &fovi_force, FOVI &fovi_measure, Cvi_config &vi, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1)	// dual ch fovi shorted, one force v, one measure v
{
	double result[SITE_NUM];

	fovi_force.Set(FV, vi.v, vi.v_range, vi.i_range, RELAY_ON);
	fovi_measure.Set(FI, 0, vi.v_range, FOVI_1UA, RELAY_ON);

	delay_ms(vi.delay);

    fovi_measure.MeasureVI(vi.sample_times, vi.sample_period);
	SERIAL_BC result[SITE_BC]=fovi_measure.GetMeasResult(SITE_BC, MVRET) * get_scale(unit);	

	fovi_force.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_ON);
 	fovi_force.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_OFF);

 	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result, lolim, hilim, unit);

	return TRUE;

}

BOOL BoardCheck::test_v(QVM &qvm_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	double result[SITE_NUM];

	QVM_LADC_VRANG v_range = QVM_LADC_5V;
	if(hilim < 0.1 * get_scale(unit))
		v_range = QVM_LADC_100MV;
	else if(hilim < 1 * get_scale(unit))
		v_range = QVM_LADC_1V;
	else if(hilim < 2 * get_scale(unit))
		v_range = QVM_LADC_2V;
	else if(hilim < 5 * get_scale(unit))
		v_range = QVM_LADC_5V;
	else if(hilim < 10 * get_scale(unit))
		v_range = QVM_LADC_10V;
	else if(hilim < 20 * get_scale(unit))
		v_range = QVM_LADC_20V;
	else if(hilim < 50 * get_scale(unit))
		v_range = QVM_LADC_50V;
	else if(hilim < 100 * get_scale(unit))
		v_range = QVM_LADC_100V;

	qvm_res.Connect();
	delay_ms(5);

	qvm_res.MeasureLADC(100, 10, v_range, QVM_LADC_10KHz, MEAS_NORMAL);
	SERIAL_BC	result[SITE_BC] = qvm_res.GetMeasResult(SITE_BC, AVERAGE_RESULT) * get_scale(unit);	

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result, lolim, hilim, unit);

	return TRUE;
}

BOOL BoardCheck::test_r(FOVI &fovi_res, DWORD delay, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1)
{
	double result_v[SITE_NUM];
	double result_i[SITE_NUM];
	double result_r[SITE_NUM];

	if(delay <= 0){
		string comment;
		comment = "T" + int2str(tnum) + " " + component + " test_r delay can't be less than 0ms";
		MessageBoxA(NULL, comment.c_str(), "诊断提示对话框", MB_OK);
		return FALSE;
	}

	SERIAL_BC{
		BEGIN_SINGLE_SITE(SITE_BC);

		fovi_res.Set(FV, 1, FOVI_1V, FOVI_1A, RELAY_ON);
		delay_ms(5);
		fovi_res.MeasureVI(40, 10);
		result_v[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET) ;	
		result_i[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MIRET) ;	
		if(result_i[SITE_BC] > 0.1){
			fovi_res.Set(FV, 0, FOVI_1V, FOVI_1A, RELAY_ON);
			delay_ms(2);
			fovi_res.Set(FI, 0.2, FOVI_2V, FOVI_1A, RELAY_ON);
			delay_ms(5);
			fovi_res.MeasureVI(40, 10);
			result_v[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET) ;	
			result_i[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MIRET) ;	
			result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);
		} else {	
			fovi_res.Set(FV, 1, FOVI_1V, FOVI_100MA, RELAY_ON);
			delay_ms(5);
			fovi_res.MeasureVI(40, 10);
			result_v[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET) ;	
			result_i[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MIRET) ;	
			if(result_i[SITE_BC] > 0.01){
				result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);			
			} else {
				fovi_res.Set(FV, 1, FOVI_1V, FOVI_10MA, RELAY_ON);
				delay_ms(10);
				fovi_res.MeasureVI(40, 10);
				result_v[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET) ;	
				result_i[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MIRET) ;	
				if(result_i[SITE_BC] > 0.001){
					result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);							
				} else {
					fovi_res.Set(FV, 1, FOVI_1V, FOVI_1MA, RELAY_ON);
					delay_ms(delay);
					fovi_res.MeasureVI(40, 10);
					result_v[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET) ;	
					result_i[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MIRET) ;	
					if(result_i[SITE_BC] > 100e-6){
						result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);							
					} else {
						fovi_res.Set(FV, 1, FOVI_1V, FOVI_100UA, RELAY_ON);
						delay_ms(delay);
						fovi_res.MeasureVI(40, 10);
						result_v[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET) ;	
						result_i[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MIRET) ;	
						if(result_i[SITE_BC] > 10e-6){
							result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);							
						} else {
							fovi_res.Set(FV, 1, FOVI_1V, FOVI_10UA, RELAY_ON);
							delay_ms(delay);
							fovi_res.MeasureVI(40, 10);
							result_v[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET) ;	
							result_i[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MIRET) ;							
							if(result_i[SITE_BC] > 1e-6){
								result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);							
							} else {
								fovi_res.Set(FV, 1, FOVI_1V, FOVI_1UA, RELAY_ON);
								delay_ms(delay);
								fovi_res.MeasureVI(40, 10);
								result_v[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET) ;	
								result_i[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MIRET) ;							
								result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);
							}
						}
					}
				}
			}
		}
	
		result_r[SITE_BC] = result_r[SITE_BC] * get_scale(unit);

		END_SINGLE_SITE() 
	} 

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result_r[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result_r, lolim, hilim, unit);

	return TRUE;
}

BOOL BoardCheck::test_r(FPVI10 &fpvi_res, DWORD delay, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1)
{
	double result_v[SITE_NUM];
	double result_i[SITE_NUM];
	double result_r[SITE_NUM];
	double result_v1[SITE_NUM];
	double result_i1[SITE_NUM];

	if(delay <= 0){
		string comment;
		comment = "T" + int2str(tnum) + " " + component + " test_r delay can't be less than 0ms";
		MessageBoxA(NULL, comment.c_str(), "诊断提示对话框", MB_OK);
		return FALSE;
	}

	SERIAL_BC{
		BEGIN_SINGLE_SITE(SITE_BC);

		fpvi_res.Set(FV, 1, FPVI10_1V, FPVI10_1A, RELAY_ON);
		delay_ms(5);
		fpvi_res.MeasureVI(40, 10);
		result_v[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
		result_i[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;	
		if(result_i[SITE_BC] > 0.1){
			fpvi_res.Set(FV, 0, FPVI10_1V, FPVI10_1A, RELAY_ON);
			delay_ms(2);
			fpvi_res.Set(FI, 0.2, FPVI10_2V, FPVI10_1A, RELAY_ON);
			delay_ms(5);
			fpvi_res.MeasureVI(40, 10);
			result_v[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
			result_i[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;	
			result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);

			if(result_r[SITE_BC] < 0.2){	// for small resistor measurement
				fpvi_res.Set(FI, 0.2, FPVI10_100MV, FPVI10_1A, RELAY_ON);

				delay_ms(5);
				fpvi_res.MeasureVI(200, 10);
				result_v[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
				result_i[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;

				fpvi_res.Set(FI, 0.4, FPVI10_100MV, FPVI10_1A, RELAY_ON);

				delay_ms(5);
				fpvi_res.MeasureVI(200, 10);
				result_v1[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
				result_i1[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;

				result_r[SITE_BC] = (result_v1[SITE_BC] -  result_v[SITE_BC]) / (result_i1[SITE_BC] - result_i[SITE_BC] + 1e-32);
			}
		} else {	
			fpvi_res.Set(FV, 1, FPVI10_1V, FPVI10_100MA, RELAY_ON);
			delay_ms(5);
			fpvi_res.MeasureVI(40, 10);
			result_v[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
			result_i[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;	
			if(result_i[SITE_BC] > 0.01){
				result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);			
			} else {
				fpvi_res.Set(FV, 1, FPVI10_1V, FPVI10_10MA, RELAY_ON);
				delay_ms(10);
				fpvi_res.MeasureVI(40, 10);
				result_v[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
				result_i[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;	
				if(result_i[SITE_BC] > 0.001){
					result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);							
				} else {
					fpvi_res.Set(FV, 1, FPVI10_1V, FPVI10_1MA, RELAY_ON);
					delay_ms(delay);
					fpvi_res.MeasureVI(40, 10);
					result_v[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
					result_i[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;	
					if(result_i[SITE_BC] > 100e-6){
						result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);							
					} else {
						fpvi_res.Set(FV, 1, FPVI10_1V, FPVI10_100UA, RELAY_ON);
						delay_ms(delay);
						fpvi_res.MeasureVI(40, 10);
						result_v[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
						result_i[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;	
						if(result_i[SITE_BC] > 10e-6){
							result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);							
						} else {
							fpvi_res.Set(FV, 1, FPVI10_1V, FPVI10_10UA, RELAY_ON);
							delay_ms(delay);
							fpvi_res.MeasureVI(40, 10);
							result_v[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET) ;	
							result_i[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MIRET) ;							
							result_r[SITE_BC] = result_v[SITE_BC] / (result_i[SITE_BC] + 1e-32);							
						}
					}
				}
			}
		}
	
		result_r[SITE_BC] = result_r[SITE_BC] * get_scale(unit);

		END_SINGLE_SITE() 
	} 

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result_r[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result_r, lolim, hilim, unit);

	return TRUE;
}

void regression(int points,double *xin,double *yin,double *offs,double *slope,double *rms_err,double *max_err)
{
	double sx=0,sy=0,sxx=0,syy=0,sxy=0;
	double ax,ay;
	double rmserr,maxerr;
	int i;

	for(i=0;i<points;i++) {
		sx+=xin[i]; sy+=yin[i];
		sxx+=xin[i]*xin[i]; sxy+=xin[i]*yin[i];
		syy+=yin[i]*yin[i];
	}
	/* calc best line fit */
	ax=sx/points; ay=sy/points; ; 
	*slope=(sxy-points*ax*ay)/(sxx-points*ax*ax);
	*offs=ay - *slope*ax;

	/* get worst case and rms error compared to best line fit */
	maxerr=sx=sxx=0;
	for(i=0;i<points;i++) {
		double err=yin[i]-(xin[i]**slope+*offs);
		sx+=err;
		sxx+=err*err;
		if(fabs(err)>fabs(maxerr))
			maxerr=fabs(err);
	}
	rmserr=sqrt((points*sxx-sx*sx)/(points*(points-1)));

	if(rms_err)
		*rms_err=rmserr;
	if(max_err)
		*max_err=maxerr;
}

BOOL BoardCheck::test_cap(FOVI &fovi_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	const int samples = 1000;
	int interval = 10; // us
	double vmax = 5;
	double vmin = 0;
	double i_set = /*(hilim - lolim) / 2*/ lolim / get_scale(unit) * 0.5 * (vmax - vmin) / samples / (interval * 1e-6);

	string str(component);
	str = str + "中的电容太小，无法测量\n可以尝试修改 low test limit";
	if(i_set < 80e-9)
		MessageBoxA(NULL, str.c_str(), "诊断提示对话框", MB_OK);

	FOVI_IRNG i_range;
	i_range = get_fovi_i_range(i_set);

	fovi_res.Set(FV, 0, FOVI_5V, FOVI_100MA, RELAY_ON); // discharge
	delay_ms(20);
	fovi_res.Set(FV, 0, FOVI_5V, i_range, RELAY_ON); 
	delay_ms(2);
	fovi_res.Set(FI, i_set, FOVI_5V, i_range, RELAY_ON);

	double pat[samples] = {0};
	for(int i=0; i<samples; ++i)
		pat[i] = i_set;

	fovi_res.AwgClear();
	fovi_res.AwgLoader("awg_cap", FI, FOVI_5V, i_range, pat, samples);
	fovi_res.AwgSelect("awg_cap", 0, samples-1, samples-1, interval);
	fovi_res.MeasureVI(samples, interval, MEAS_AWG);

	STSEnableAWG(&fovi_res);
	STSEnableMeas(&fovi_res);

	StsAWGRun();
	double cap[SITE_NUM][samples];

	SERIAL_BC	fovi_res.BlockRead(SITE_BC, 0, samples, cap[SITE_BC], MVRET);

	double offset = 0;
	double slope = 0;
	//double t[samples] = {0};
	//for(int i=0; i<samples; ++i)
	//	t[i] = interval * 1e-6;

	double result_c[SITE_NUM]; 
	SERIAL_BC{
		//regression(samples - 50, t, cap[SITE_BC], &offset, &slope, NULL, NULL);
		slope = 0;
		for(int i=200; i<500; ++i){
			slope = slope + (cap[SITE_BC][i+300] - cap[SITE_BC][i]) / (interval * 1e-6 * 300);
		}
		slope /= 300;
		if(slope != 0)
			result_c[SITE_BC] = i_set / slope * get_scale(unit);
		else
			result_c[SITE_BC] = 9999;
	}

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result_c[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result_c, lolim, hilim, unit);

	fovi_res.Set(FV, 0, FOVI_5V, FOVI_100MA, RELAY_ON); // discharge
	fovi_res.Set(FV, 0, FOVI_5V, FOVI_100MA, RELAY_OFF); 

	return TRUE;
}


BOOL BoardCheck::test_cap1(FOVI &fovi_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	double result[SITE_NUM]={0};
	double MeasV1[SITE_NUM]={0};
	double MeasV2[SITE_NUM]={0};
	FOVI_IRNG i_range;

	double cap_i = lolim / get_scale(unit) * 5 / 5e-3; // A
	i_range = get_fovi_i_range(cap_i);

	fovi_res.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_ON); // discharge
	delay_ms(20);
	fovi_res.Set(FI, 0, FOVI_10V, i_range, RELAY_ON);
	delay_ms(1);

	fovi_res.Set(FI, cap_i, FOVI_10V, i_range, RELAY_ON);
	delay_ms(1);

	fovi_res.MeasureVI(10, 10);
	SERIAL_BC MeasV1[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET);
	delay_ms(5);
	fovi_res.MeasureVI(10, 10);
	SERIAL_BC MeasV2[SITE_BC] = fovi_res.GetMeasResult(SITE_BC, MVRET);

	SERIAL_BC result[SITE_BC] = (cap_i * 5e-3) / (MeasV2[SITE_BC] - MeasV1[SITE_BC] + 1e-12) * get_scale(unit); // F

	fovi_res.Set(FI, 0, FOVI_10V, i_range, RELAY_ON);
	fovi_res.Set(FV, 0, FOVI_10V, FOVI_10MA, RELAY_ON);

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result, lolim, hilim, unit);

	return TRUE;
}	

BOOL BoardCheck::test_cap(FPVI10 &fpvi_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	const int samples = 1000;
	int interval = 10; // us
	double vmax = 5;
	double vmin = 0;
	double i_set = /*(hilim - lolim) / 2*/ lolim / get_scale(unit) * 0.5 * (vmax - vmin) / samples / (interval * 1e-6);

	string str(component);
	str = str + "中的电容太小，无法测量\n可以尝试修改 low test limit";
	if(i_set < 80e-9)
		MessageBoxA(NULL, str.c_str(), "诊断提示对话框", MB_OK);

	FPVI10_IRNG i_range;
	i_range = get_fpvi_i_range(i_set);

	fpvi_res.Set(FV, 0, FPVI10_5V, FPVI10_100MA, RELAY_ON); // discharge
	delay_ms(20);
	fpvi_res.Set(FV, 0, FPVI10_5V, i_range, RELAY_ON); 
	delay_ms(2);
	fpvi_res.Set(FI, i_set, FPVI10_5V, i_range, RELAY_ON);

	double pat[samples] = {0};
	for(int i=0; i<samples; ++i)
		pat[i] = i_set;

	fpvi_res.AwgClear();
	fpvi_res.AwgLoader("awg_cap", FI, FPVI10_5V, i_range, pat, samples);
	fpvi_res.AwgSelect("awg_cap", 0, samples-1, samples-1, interval);
	fpvi_res.MeasureVI(samples, interval, MEAS_AWG);

	STSEnableAWG(&fpvi_res);
	STSEnableMeas(&fpvi_res);

	StsAWGRun();
	double cap[SITE_NUM][samples];

	SERIAL_BC	fpvi_res.BlockRead(SITE_BC, 0, samples, cap[SITE_BC], MVRET);

	double offset = 0;
	double slope = 0;
	//double t[samples] = {0};
	//for(int i=0; i<samples; ++i)
	//	t[i] = interval * 1e-6;

	double result_c[SITE_NUM]; 
	SERIAL_BC{
		//regression(samples - 50, t, cap[SITE_BC], &offset, &slope, NULL, NULL);
		slope = 0;
		for(int i=200; i<500; ++i){
			slope = slope + (cap[SITE_BC][i+300] - cap[SITE_BC][i]) / (interval * 1e-6 * 300);
		}
		slope /= 300;
		if(slope != 0)
			result_c[SITE_BC] = i_set / slope * get_scale(unit);
		else
			result_c[SITE_BC] = 9999;
	}

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result_c[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result_c, lolim, hilim, unit);

	fpvi_res.Set(FV, 0, FPVI10_5V, FPVI10_100MA, RELAY_ON); // discharge
	fpvi_res.Set(FV, 0, FPVI10_5V, FPVI10_100MA, RELAY_OFF); 

	return TRUE;
}


BOOL BoardCheck::test_cap1(FPVI10 &fpvi_res, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	double result[SITE_NUM]={0};
	double MeasV1[SITE_NUM]={0};
	double MeasV2[SITE_NUM]={0};
	FPVI10_IRNG i_range;

	double cap_i = lolim / get_scale(unit) * 5 / 5e-3; // A
	i_range = get_fpvi_i_range(cap_i);

	fpvi_res.Set(FV, 0, FPVI10_10V, FPVI10_100MA, RELAY_ON); // discharge
	delay_ms(20);
	fpvi_res.Set(FI, 0, FPVI10_10V, i_range, RELAY_ON);
	delay_ms(1);

	fpvi_res.Set(FI, cap_i, FPVI10_10V, i_range, RELAY_ON);
	delay_ms(1);

	fpvi_res.MeasureVI(10, 10);
	SERIAL_BC MeasV1[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET);
	delay_ms(5);
	fpvi_res.MeasureVI(10, 10);
	SERIAL_BC MeasV2[SITE_BC] = fpvi_res.GetMeasResult(SITE_BC, MVRET);

	SERIAL_BC result[SITE_BC] = (cap_i * 5e-3) / (MeasV2[SITE_BC] - MeasV1[SITE_BC] + 1e-12) * get_scale(unit); // F

	fpvi_res.Set(FI, 0, FPVI10_10V, i_range, RELAY_ON);
	fpvi_res.Set(FV, 0, FPVI10_10V, FPVI10_10MA, RELAY_ON);

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result[SITE_BC];
	if(result1 == NULL) log(tnum++, component, result, lolim, hilim, unit);

	return TRUE;
}	


BOOL BoardCheck::test_dio_init(){
	dio.Connect();
	dio.SetClockFreq(1e3);
	for(int i=0; i<8; ++i){
		dio.SetWaveFormat(i, "NRZ");
		dio.SetDelay(i, 0, 0);
	}
	dio.SetVIH(5);
	dio.SetVIL(0);

	return TRUE;
}


BOOL BoardCheck::test_dio_L(FOVI &fovi_res, int* dio_ch, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	string line("11111111");
	SERIAL_BC {
		int pos = 7 - dio_ch[SITE_BC];
		line[pos] = '0';				
	}
	char * p=new char[9];
	strcpy_s(p, 9, line.c_str());
	dio.LoadPattern(1, p);
	dio.LoadPattern(2, p);
	delete p;
	p = NULL;

	dio.LoopSet(1, 2, -1); // infinite loop 
	dio.RunPattern(1, 2);
   	delay_ms(2);

	Cvi_config vi; // default FV,3V,0A,FOVI_5V,FOVI_10MA,10ms,100 sample times,10 us interval
	vi.mode = FI;
	vi.i_range = FOVI_10UA;

	test_v(fovi_res, vi, tnum, component, lolim, hilim, unit, result1);

	dio.StopPattern();

	return TRUE;
}


BOOL BoardCheck::test_dio_H(FOVI &fovi_res, int* dio_ch, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	string line("00000000");
	SERIAL_BC {
		int pos = 7 - dio_ch[SITE_BC];
		line[pos] = '1';				
	}
	char * p=new char[9];
	strcpy_s(p, 9, line.c_str());
	dio.LoadPattern(1, p);
	dio.LoadPattern(2, p);
	delete p;
	p = NULL;

	dio.LoopSet(1, 2, -1); // infinite loop 
	dio.RunPattern(1, 2);
   	delay_ms(2);

	Cvi_config vi; // default FV,3V,0A,FOVI_5V,FOVI_10MA,10ms,100 sample times,10 us interval
	vi.mode = FI;
	vi.i_range = FOVI_10UA;

	test_v(fovi_res, vi, tnum, component, lolim, hilim, unit, result1);

	dio.StopPattern();

	return TRUE;
}	

BOOL BoardCheck::test_dio_Z(FOVI &fovi_res, int* dio_ch, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	string line("00000000");
	SERIAL_BC {
		int pos = 7 - dio_ch[SITE_BC];
		line[pos] = 'X';				
	}
	char * p=new char[9];
	strcpy_s(p, 9, line.c_str());
	dio.LoadPattern(1, p);
	dio.LoadPattern(2, p);
	delete p;
	p = NULL;

	dio.LoopSet(1, 2, -1); // infinite loop 
	dio.RunPattern(1, 2);
   	delay_ms(2);

	Cvi_config vi; // default FV,3V,0A,FOVI_5V,FOVI_10MA,10ms,100 sample times,10 us interval
	vi.mode = FV;
	vi.i_range = FOVI_10UA;

	test_i(fovi_res, vi, tnum, component, lolim, hilim, unit, result1);

	dio.StopPattern();

	return TRUE;
}	

BOOL BoardCheck::test_qtmu(FOVI &fovi_res, QTMU_PLUS qtmu, DWORD tnum, const char* component, double lolim, double hilim, const char* unit, double *result1){
	double result[SITE_NUM];
 	fovi_res.Set(FV, 0, FOVI_5V, FOVI_10MA, RELAY_ON);

	qtmu.SetStartInput(QTMU_PLUS_IMPEDANCE_1M, QTMU_PLUS_VRNG_25V, QTMU_PLUS_FILTER_100KHz);
	qtmu.SetStopInput(QTMU_PLUS_IMPEDANCE_1M, QTMU_PLUS_VRNG_25V, QTMU_PLUS_FILTER_100KHz);
	qtmu.SetInSource(QTMU_PLUS_SINGLE_SOURCE);
	qtmu.SetStartTrigger(2.5, QTMU_PLUS_POS_SLOPE);
	qtmu.SetStopTrigger(2.5, QTMU_PLUS_NEG_SLOPE);
	qtmu.Connect();
   	delay_ms(5);

	SERIAL_BC {
		qtmu.SetSinglePulseMeas(QTMU_PLUS_FINE, QTMU_PLUS_TRNG_US, SITE_BC);

		fovi_res.Pulse(5, 1000, -500, 200, 10);
   		delay_ms(2);
		qtmu.SinglePlsMeas(SITE_BC);
		result[SITE_BC] = qtmu.GetMeasureResult(SITE_BC);
	}

	qtmu.Disconnect();

	if(result1 != NULL)	SERIAL_BC result1[SITE_BC] = result[SITE_BC];
	if(result1 == NULL) log(tnum, component, result, lolim, hilim, unit);

	return TRUE;
}
